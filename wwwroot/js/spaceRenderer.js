window.spaceRenderer = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,

    init: function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);

        // Create Scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1); // Deep Space Black

        // Light (Sun)
        var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.6;
        var dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dirLight.intensity = 0.8;

        // Skybox (Procedural Starfield) - No cached textures
        var skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 2000.0 }, this.scene);
        var skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0); // Black void
        skybox.material = skyboxMaterial;

        // Add random stars
        var sps = new BABYLON.SolidParticleSystem("stars", this.scene);
        var starShape = BABYLON.MeshBuilder.CreateSphere("s", { diameter: 2, segments: 2 }, this.scene);
        sps.addShape(starShape, 2000); // 2000 stars
        starShape.dispose();

        var mesh = sps.buildMesh();
        mesh.material = new BABYLON.StandardMaterial("starMat", this.scene);
        mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mesh.material.disableLighting = true;

        sps.initParticles = function () {
            for (var p = 0; p < this.nbParticles; p++) {
                // Spawn randomly in a large sphere
                var distance = 800 + Math.random() * 800;
                var theta = Math.random() * 2 * Math.PI;
                var phi = Math.acos(2 * Math.random() - 1);

                this.particles[p].position.x = distance * Math.sin(phi) * Math.cos(theta);
                this.particles[p].position.y = distance * Math.sin(phi) * Math.sin(theta);
                this.particles[p].position.z = distance * Math.cos(phi);

                // Random size
                var s = 0.5 + Math.random();
                this.particles[p].scaling.x = s;
                this.particles[p].scaling.y = s;
                this.particles[p].scaling.z = s;
            }
        };
        sps.initParticles();
        sps.setParticles();
        this.starSystem = sps; // Store Ref for Warp Effect

        // Create Player Ship
        this.createPlayerShip();
        this.lasers = [];
        this.enemies = [];
        this.createEnemies();

        // Camera (Follow Ship)
        // Parameters: Name, Position, Scene
        this.camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), this.scene);
        this.camera.radius = 15; // How far from the object to follow
        this.camera.heightOffset = 5; // How high above the object to place the camera
        this.camera.rotationOffset = 180; // The viewing angle
        this.camera.cameraAcceleration = 0.05; // How fast to move
        this.camera.maxCameraSpeed = 20; // Speed limit
        this.camera.lockedTarget = this.ship; // Target the ship

        // this.camera.attachControl(this.canvas, true); // DISABLED: Using Custom Ship Steering

        // Input Handling
        this.inputMap = {};
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
            var key = evt.sourceEvent.key.toLowerCase();
            this.inputMap[key] = evt.sourceEvent.type == "keydown";

            // Fire Laser on Space (Single Press)
            if (key === " " && evt.sourceEvent.type == "keydown") {
                this.shootLaser();
            }
        }));
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type == "keydown";
        }));

        // Render Loop
        this.engine.runRenderLoop(() => {
            this.updateShip();
            this.updateLasers();
            this.checkCollisions();
            this.checkGateCollisions();
            this.updateWarpEffect(); // Process Warp Visuals
            this.scene.render();
        });

        // Resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        // Click to Lock
        this.canvas.addEventListener("click", () => {
            this.canvas.requestPointerLock = this.canvas.requestPointerLock || this.canvas.mozRequestPointerLock;
            this.canvas.requestPointerLock();
        });

        // Mouse Wheel Zoom
        this.canvas.addEventListener("wheel", (evt) => {
            evt.preventDefault(); // Stop page scroll

            // Adjust Zoom (Camera Radius)
            // Delta is usually +/- 100
            var zoomSpeed = 0.05;
            this.camera.radius += evt.deltaY * zoomSpeed;

            // Limit Zoom
            if (this.camera.radius < 8) this.camera.radius = 8;
            if (this.camera.radius > 60) this.camera.radius = 60;
        }, { passive: false }); // Passive false is required to use preventDefault

        this.setupMouse();
        this.canvas.focus();
    },

    // --- Galaxy Rendering ---

    loadSystem: function (data) {
        console.log("Loading System:", data);
        this.clearSystem();

        // 1. Update Environment
        // Skybox Color (Tint the texture or just change diffuse?)
        // StandardMaterial doesn't support 'tinting' a reflection texture easily, 
        // but we can change the ambient/emissive color of the box itself or fog.
        // Let's rely on the Sun color for mood.

        // 2. Create Sun (Central Light)
        this.createSun(data.sunColor);

        // 3. Create Jump Gates
        if (data.jumpGates) {
            data.jumpGates.forEach(gate => this.createGate(gate));
        }

        // 4. Create Planets
        if (data.planets) {
            data.planets.forEach(planet => this.createPlanet(planet));
        }
    },

    clearSystem: function () {
        // Dispose of all 'System' meshes, but keep Player and Camera
        // We tagged them? No. We'll use a specific array or just standard disposal.
        // Simple way: Dispose everything that isn't player or camera or skybox.
        // Better way: Track them in an array.
        if (this.systemMeshes) {
            this.systemMeshes.forEach(m => m.dispose());
        }
        this.systemMeshes = [];
    },

    createSun: function (colorHex) {
        // Visual Mesh (Big Star)
        var sun = BABYLON.MeshBuilder.CreateSphere("sun", { diameter: 100 }, this.scene);
        var sunMat = new BABYLON.StandardMaterial("sunMat", this.scene);
        sunMat.emissiveColor = BABYLON.Color3.FromHexString(colorHex || "#FFFF00");
        sun.material = sunMat;
        this.systemMeshes.push(sun);

        // Light Source
        // We already have a Hemispheric, but let's change its color?
        // Actually, let's just make the ambient light match the sun.
        // (Keeping it simple for performance)
    },

    createGate: function (gateData) {
        // Parent Node (Handles Position & LookAt)
        var gateRoot = new BABYLON.TransformNode("gateRoot_" + gateData.targetSystemId, this.scene);
        gateRoot.position = new BABYLON.Vector3(gateData.position.x, gateData.position.y, gateData.position.z);
        gateRoot.lookAt(BABYLON.Vector3.Zero()); // Face the system center

        // Torus Ring (Visual) - Child of gateRoot
        // Rotated 90 degrees X to stand "Up" relative to the look direction
        var gate = BABYLON.MeshBuilder.CreateTorus("gate_" + gateData.targetSystemId, { diameter: 50, thickness: 3, tessellation: 64 }, this.scene);
        gate.parent = gateRoot;
        gate.rotation.x = Math.PI / 2; // Vertical Stand

        // Material (Neon Blue + Emissive)
        var mat = new BABYLON.StandardMaterial("gateMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(0, 1, 1); // Bright Cyan
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        gate.material = mat;

        // Glow Layer for the whole scene (if not exists)
        if (!this.glowLayer) {
            this.glowLayer = new BABYLON.GlowLayer("glow", this.scene);
            this.glowLayer.intensity = 0.6;
        }

        // Text Label (Billboard)
        var plane = BABYLON.MeshBuilder.CreatePlane("label_" + gateData.name, { size: 30 }, this.scene);
        plane.parent = gateRoot; // Attach to Root so it doesn't spin with the ring if we spin it later
        plane.position.y = 35;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; // Always face cam

        // Dynamic Texture for Text
        var dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", { width: 512, height: 128 }, this.scene);
        dynamicTexture.hasAlpha = true;
        dynamicTexture.drawText(gateData.name, null, null, "bold 60px Arial", "cyan", "transparent", true);
        var labelMat = new BABYLON.StandardMaterial("labelMat", this.scene);
        labelMat.diffuseTexture = dynamicTexture;
        labelMat.emissiveColor = new BABYLON.Color3(0.5, 1, 1);
        labelMat.backFaceCulling = false;
        plane.material = labelMat;

        this.systemMeshes.push(gateRoot); // Track root to dispose later
        this.systemMeshes.push(gate);
        this.systemMeshes.push(plane);
    },

    createPlanet: function (planetData) {
        var sphere = BABYLON.MeshBuilder.CreateSphere("planet_" + planetData.name, { diameter: planetData.size }, this.scene);

        // DEBUG: Force Safety Check
        // If the planet thinks it's closer than 800 units, we push it out.
        // This handles cases where C# DLLs might be cached/stale.
        var pos = new BABYLON.Vector3(planetData.position.x, planetData.position.y, planetData.position.z);
        var dist = pos.length();
        if (dist < 800) {
            console.warn(`Planet ${planetData.name} spawned too close (${dist}). Pushing outward.`);
            pos.normalize().scaleInPlace(1000 + (Math.random() * 2000));
        }

        sphere.position = pos;

        var mat = new BABYLON.StandardMaterial("planetMat", this.scene);
        if (planetData.type === "Gas Giant") {
            mat.diffuseColor = new BABYLON.Color3(0.8, 0.4, 0.1); // Jupiter-ish
        } else {
            mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0); // Earth-ish
        }
        sphere.material = mat;

        this.systemMeshes.push(sphere);
    },

    // --- Game Logic ---

    setDotNetRef: function (ref) {
        this.dotNetRef = ref;
    },

    jumpToSystem: function (systemId) {
        if (this.dotNetRef) {
            this.dotNetRef.invokeMethodAsync("JumpToSystem", systemId);
        }
    },

    checkGateCollisions: function () {
        if (!this.ship || !this.shipBody) return;

        // Loop through meshes to find gates
        if (this.systemMeshes) {
            this.systemMeshes.forEach(mesh => {
                if (mesh.parent && mesh.parent.name && mesh.parent.name.startsWith("gateRoot_")) {
                    // Check against the Gate Root or the specific child? 
                    // checkGateCollisions iterates 'systemMeshes', which includes gateRoot AND gate (child).
                    // We only want to check the gate mesh itself (the torus), not the root or label.
                }

                if (mesh.name.startsWith("gate_")) {
                    if (this.shipBody.intersectsMesh(mesh, true)) {
                        var targetId = mesh.name.substring(5); // Remove "gate_" prefix

                        if (!this.isJumping) {
                            this.isJumping = true;
                            this.isWarping = true; // Trigger Warp Visuals
                            console.log("Engaging Warp Drive...");

                            // 1. Warp Sound? (TODO)

                            // 2. Schedule Jump
                            setTimeout(() => {
                                this.jumpToSystem(targetId);
                                this.isJumping = false;
                                this.isWarping = false;
                                // Reset Stats
                                this.scene.activeCamera.fov = 0.8; // Reset FOV
                            }, 2000);
                        }
                    }
                }
            });
        }
    },

    updateWarpEffect: function () {
        if (!this.starSystem || !this.starSystem.mesh) return;

        if (this.isWarping) {
            // ENGAGE WARP: Move Stars FAST towards camera (simulate speed)
            // Instead of scaling (which makes needles invisible head-on), we move the universe.
            this.starSystem.mesh.position.z -= 100;

            // Loop the stars so we don't run out
            if (this.starSystem.mesh.position.z < -2000) {
                this.starSystem.mesh.position.z = 2000;
            }

            // Hyperspace Tunnel FOV
            this.scene.activeCamera.fov = BABYLON.Scalar.Lerp(this.scene.activeCamera.fov, 1.5, 0.05);
        } else {
            // DISENGAGE: Reset
            this.starSystem.mesh.position.z = 0;
            // this.starSystem.mesh.scaling.z = 1; 

            // Return FOV
            this.scene.activeCamera.fov = BABYLON.Scalar.Lerp(this.scene.activeCamera.fov, 0.8, 0.1);
        }
    },

    createEnemies: function () {
        var mat = new BABYLON.StandardMaterial("enemyMat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0, 0); // Red
        mat.emissiveColor = new BABYLON.Color3(0.5, 0, 0); // Slight Glow

        // Spawn 10 Random Cubes
        for (var i = 0; i < 10; i++) {
            var enemy = BABYLON.MeshBuilder.CreateBox("enemy" + i, { size: 4 }, this.scene);

            // Random Position in front of player
            var x = (Math.random() - 0.5) * 100;
            var y = (Math.random() - 0.5) * 50;
            var z = 50 + (Math.random() * 200);

            enemy.position = new BABYLON.Vector3(x, y, z);
            enemy.material = mat;

            // Random Rotation visual
            enemy.rotation = new BABYLON.Vector3(Math.random(), Math.random(), Math.random());

            this.enemies.push(enemy);
        }
    },

    shootLaser: function () {
        if (!this.ship) return;

        var laser = BABYLON.MeshBuilder.CreateCylinder("laser", { height: 10, diameter: 0.5 }, this.scene);
        laser.rotation.x = Math.PI / 2;

        // Start at ship position
        laser.position = this.ship.position.clone();

        // Initial Rotation matching ship
        laser.rotationQuaternion = this.ship.rotationQuaternion ? this.ship.rotationQuaternion.clone() : null;
        if (!laser.rotationQuaternion) {
            laser.rotation.x = this.ship.rotation.x + (Math.PI / 2); // Cylinder correction
            laser.rotation.y = this.ship.rotation.y;
            laser.rotation.z = this.ship.rotation.z;
        }

        // Color
        var laserMat = new BABYLON.StandardMaterial("laserMat", this.scene);
        laserMat.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green Laser
        laserMat.disableLighting = true;
        laser.material = laserMat;

        // Velocity (Always forward relative to ship)
        laser.direction = this.ship.forward.scale(5); // Speed 5

        // Despawn Timer
        laser.life = 60; // 1 second @ 60fps

        this.lasers.push(laser);
    },

    updateLasers: function () {
        for (var i = this.lasers.length - 1; i >= 0; i--) {
            var laser = this.lasers[i];
            laser.position.addInPlace(laser.direction);

            laser.life--;
            if (laser.life <= 0) {
                laser.dispose();
                this.lasers.splice(i, 1);
            }
        }
    },

    checkCollisions: function () {
        // Simple Distance Check (AABB is overkill for cubes)
        for (var i = this.lasers.length - 1; i >= 0; i--) {
            var laser = this.lasers[i];

            for (var j = this.enemies.length - 1; j >= 0; j--) {
                var enemy = this.enemies[j];

                if (laser.intersectsMesh(enemy, true)) { // Babylon's built-in OBB check
                    // HIT!

                    // FX?

                    // Destroy Both
                    enemy.dispose();
                    this.enemies.splice(j, 1);

                    laser.dispose();
                    this.lasers.splice(i, 1);

                    break; // Laser can only hit one thing (for now)
                }
            }
        }
    },

    createPlayerShip: function () {
        // Root Node (The actual physics center)
        this.ship = new BABYLON.TransformNode("PlayerShip", this.scene);

        // Body (Cylinder)
        var body = BABYLON.MeshBuilder.CreateCylinder("body", { height: 4, diameterTop: 0, diameterBottom: 1.5, tessellation: 8 }, this.scene);
        body.rotation.x = Math.PI / 2; // Point forward
        body.parent = this.ship;
        var hullMat = new BABYLON.StandardMaterial("hullMat", this.scene);
        hullMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.8);
        hullMat.specularColor = new BABYLON.Color3(1, 1, 1);
        body.material = hullMat;

        this.shipBody = body; // FIX: Expose body for collision checks

        // Wings
        var wings = BABYLON.MeshBuilder.CreateBox("wings", { width: 4, height: 0.1, depth: 1.5 }, this.scene);
        wings.position.z = -0.5;
        wings.parent = this.ship;
        wings.material = hullMat;

        // Engine Glow
        var engine = BABYLON.MeshBuilder.CreateCylinder("engine", { height: 0.5, diameter: 1 }, this.scene);
        engine.rotation.x = Math.PI / 2;
        engine.position.z = -2;
        engine.parent = this.ship;
        var engineMat = new BABYLON.StandardMaterial("engineMat", this.scene);
        engineMat.emissiveColor = new BABYLON.Color3(0, 0.5, 1); // Blue glow
        engine.material = engineMat;
    },

    updateShip: function () {
        if (!this.ship) return;

        var speed = 0.4;
        var turnSpeed = 0.02;

        // Movement (Thrust)
        if (this.inputMap["w"]) {
            this.ship.position.addInPlace(this.ship.forward.scale(speed));
        }
        if (this.inputMap["s"]) {
            // Space Brake
            speed = 0;
        }

        // Mouse Steering (Freelancer Style)
        // We use the mouse position relative to center of screen to determine turn rate
        // We need 'Pointer Lock' for this to work best, but we'll fall back to standard mouse pos

        // Rotation Banking (Visual Roll)
        // We smoothly interpolate the Z rotation (Roll) based on how hard we are turning
        // targetRoll is set in setupMouse
        var roll = this.targetRoll || 0;
        this.ship.rotation.z = BABYLON.Scalar.Lerp(this.ship.rotation.z, roll, 0.1);

        // Decay roll if no mouse input (happens automatically via mouse delta 0)
        this.targetRoll = BABYLON.Scalar.Lerp(this.targetRoll || 0, 0, 0.1);
    },

    resetShip: function () {
        if (this.ship) {
            this.ship.position = new BABYLON.Vector3(0, 0, -50); // safe entry point
            this.ship.rotation = BABYLON.Vector3.Zero();
            this.ship.rotationQuaternion = null;
        }
    },

    setupMouse: function () {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (document.pointerLockElement !== this.canvas) return;

            // Sensitivity
            var sensitivity = 0.002;
            var dx = pointerInfo.event.movementX || 0;
            var dy = pointerInfo.event.movementY || 0;

            // Yaw (Left/Right) - Rotate around GLOBAL Y axis? No, Local Y.
            // Actually, for space ships, we want pitch/yaw/roll relative to ship.
            // Babylon's rotation property is Euler, which has gimbal lock issues.
            // Ideally use RotationQuaternion.

            if (!this.ship.rotationQuaternion) {
                this.ship.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(this.ship.rotation.y, this.ship.rotation.x, this.ship.rotation.z);
            }

            // Apply rotations manually using Quaternions
            // Yaw (Y axis) - Negative dx because screen left = rotate left
            var yaw = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, dx * sensitivity);
            // Pitch (X axis) - Positive dy because mouse down = pitch up? Usually mouse up = pitch down (flight sim)
            var pitch = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, dy * sensitivity);

            // Compose
            this.ship.rotationQuaternion = this.ship.rotationQuaternion.multiply(yaw).multiply(pitch);

            // Calculate Banking
            this.targetRoll = -dx * 0.5;
        });
    }
};
