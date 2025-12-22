window.spaceRenderer = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,

    init: function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);

        // Reset State (Fix for SPA Persistence)
        this.autopilotTarget = null;
        this.isCruising = false;
        this.isJumping = false;
        this.isWarping = false;
        this.dockTargetId = null;
        this.canDock = false;

        // Create Scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1); // Deep Space Black

        // ... (rest of init is same, just logging at start)


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

        // [NEW] Space Dust (Speed Visuals)
        this.createSpaceDust();

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

            // Toggle Cruise Control (Shift + W)
            if (key === "w" && evt.sourceEvent.shiftKey && evt.sourceEvent.type == "keydown") {
                this.isCruising = !this.isCruising;
                console.log("Cruise Control:", this.isCruising ? "ON" : "OFF");
            }
            // Cancel Cruise on Brake
            if (key === "s" && evt.sourceEvent.type == "keydown") {
                this.isCruising = false;
            }

            // ESC: Cancel Autopilot/Cruise
            if (key === "escape" && evt.sourceEvent.type == "keydown") {
                this.isCruising = false;
                this.autopilotTarget = null;
                console.log("Autopilot/Cruise Aborted.");
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync("CancelAutoNav");
                }
            }

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
            this.frame++;
            this.update();
            this.scene.render();
        });

        // Handle Window Resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        // Mouse Wheel Zoom
        this.canvas.addEventListener("wheel", (evt) => {
            evt.preventDefault(); // Stop page scroll
            var zoomSpeed = 0.05;
            this.camera.radius += evt.deltaY * zoomSpeed;
            if (this.camera.radius < 8) this.camera.radius = 8;
            if (this.camera.radius > 60) this.camera.radius = 60;
        }, { passive: false });

        this.setupMouse(); // <--- THE MISSING LINK
        this.setupPointerLock();
        this.canvas.focus();
    },

    engageAutopilotByName: function (meshName) {
        if (!this.scene) return;
        // [FIX] Check for Mesh OR TransformNode (Stations/Gates use Nodes as roots)
        var mesh = this.scene.getMeshByName(meshName) || this.scene.getTransformNodeByName(meshName);

        if (mesh) {
            this.autopilotTarget = mesh;
            this.isCruising = true;
            console.log("Engaging Autopilot to: " + meshName);
        } else {
            console.log("Autopilot Target Not Found: " + meshName);
            // Retry once after short delay (Mesh might be creating)
            setTimeout(() => {
                var mesh = this.scene.getMeshByName(meshName) || this.scene.getTransformNodeByName(meshName);
                if (mesh) {
                    this.autopilotTarget = mesh;
                    this.isCruising = true;
                    console.log("Engaging Autopilot to: " + meshName + " (Retry Success)");
                }
            }, 500);
        }
    },

    // [NEW] Interop for Save/Load
    getShipPosition: function () {
        if (!this.ship) return { x: 0, y: 0, z: 0 };
        return {
            x: this.ship.position.x,
            y: this.ship.position.y,
            z: this.ship.position.z
        };
    },

    setShipPosition: function (x, y, z) {
        if (!this.ship) return;
        this.ship.position.set(x, y, z);
        // Reset movement if any
        // If physics impostor existed, we'd reset linear velocity here
        console.log("Ship Repositioned to: ", x, y, z);
    },

    // [NEW] Helper to force unlock cursor (e.g. when Docking or Map opens)
    exitFlightMode: function () {
        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
            console.log("Flight Mode: DISENGAGED (Auto)");
        }
    },

    // Restore Pointer Lock
    setupPointerLock: function () {
        // [NEW] Tab to Toggle Flight Mode (No more Click stealing)
        window.addEventListener("keydown", (evt) => {
            if (evt.code === "Tab") {
                evt.preventDefault(); // Stop focus change

                var canvas = this.canvas;
                if (document.pointerLockElement === canvas) {
                    document.exitPointerLock();
                    console.log("Flight Mode: DISENGAGED");
                } else {
                    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
                    canvas.requestPointerLock();
                    console.log("Flight Mode: ENGAGED");
                }
            }
        });
    },

    // ... (Systems omitted, jump to setupMouse)

    setupMouse: function () {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (document.pointerLockElement !== this.canvas) return;

            // Only PointerMove
            if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERMOVE) return;

            var sensitivity = 0.002;
            var dx = pointerInfo.event.movementX || 0;
            var dy = pointerInfo.event.movementY || 0;

            if (this.ship) {
                if (this.ship.rotationQuaternion) this.ship.rotationQuaternion = null;

                this.ship.rotation.y += dx * sensitivity;
                this.ship.rotation.x += dy * sensitivity;

                this.targetRoll = -dx * 0.5;
            }
        });
    },


    // --- Galaxy Rendering ---

    createStation: function (stationData) {
        var root = new BABYLON.TransformNode("stationRoot_" + stationData.id, this.scene);
        root.position = new BABYLON.Vector3(stationData.position.x, stationData.position.y, stationData.position.z);
        // Slowly Rotate
        this.scene.registerBeforeRender(() => { if (root) root.rotation.y += 0.002; });

        // 1. Spindle Body
        var body = BABYLON.MeshBuilder.CreateCylinder("s_body", { height: 60, diameter: 8, tessellation: 16 }, this.scene);
        body.parent = root;
        var mat = new BABYLON.StandardMaterial("s_mat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.8);
        body.material = mat;

        // 2. Solar Arrays (Cross)
        var panel1 = BABYLON.MeshBuilder.CreateBox("s_p1", { width: 4, height: 80, depth: 1 }, this.scene);
        panel1.parent = root;
        panel1.position.y = 10;
        var pMat = new BABYLON.StandardMaterial("s_pmat", this.scene);

        // [NEW] Visual Distinctiveness for Shipyards
        if (stationData.type === "Shipyard") {
            pMat.emissiveColor = new BABYLON.Color3(0.6, 0.0, 0.6); // Magenta Panels
        } else {
            pMat.emissiveColor = new BABYLON.Color3(0, 0, 0.4); // Blue Panels
        }
        panel1.material = pMat;

        var panel2 = panel1.clone("s_p2");
        panel2.parent = root;
        panel2.rotation.y = Math.PI / 2;

        // 3. Beacon
        var beacon = BABYLON.MeshBuilder.CreateSphere("s_bcn", { diameter: 4 }, this.scene);
        beacon.parent = root;
        beacon.position.y = 32;
        var bMat = new BABYLON.StandardMaterial("s_bmat", this.scene);

        if (stationData.type === "Shipyard") {
            bMat.emissiveColor = new BABYLON.Color3(1, 0, 1); // Magenta Beacon
        } else {
            bMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red Beacon
        }
        beacon.material = bMat;

        // 4. Label
        var plane = BABYLON.MeshBuilder.CreatePlane("s_lbl", { size: 20 }, this.scene);
        plane.parent = root;
        plane.position.y = 40;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        var dyTex = new BABYLON.DynamicTexture("s_tex", 512, this.scene, true);
        dyTex.hasAlpha = true;
        dyTex.drawText(stationData.name, null, null, "bold 40px Arial", "white", "transparent", true);
        var lMat = new BABYLON.StandardMaterial("s_lmat", this.scene);
        lMat.diffuseTexture = dyTex;
        lMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        lMat.backFaceCulling = false;
        plane.material = lMat;

        this.systemMeshes.push(root);
        this.systemMeshes.push(body);
        this.systemMeshes.push(panel1);
        this.systemMeshes.push(panel2);
        this.systemMeshes.push(beacon);
        this.systemMeshes.push(plane);

        // [NEW] Waypoint
        this.createWaypoint(root, "STATION", "lime");
    },

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

        // 5. Create Stations
        if (data.stations) {
            data.stations.forEach(s => this.createStation(s));
        }
    },

    clearSystem: function () {
        // Dispose of all 'System' meshes
        if (this.systemMeshes) {
            this.systemMeshes.forEach(m => m.dispose());
        }
        this.systemMeshes = [];

        // Dispose Waypoints
        if (this.waypoints) {
            this.waypoints.forEach(wp => {
                if (wp.control) wp.control.dispose();
            });
        }
        this.waypoints = [];
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

        // [NEW] Waypoint
        this.createWaypoint(gateRoot, "JUMP\nGATE", "cyan");
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
                    // [FIX] Use Distance instead of Intersection (Torus has a hole!)
                    var dist = BABYLON.Vector3.Distance(this.ship.position, mesh.absolutePosition);

                    if (dist < 40) { // Radius of gate is 25 (Dia 50) + tolerance
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
            // ENGAGE WARP: Move Stars FAST towards camera
            this.starSystem.mesh.position.z -= 100;

            // [NEW] Stretch Stars for Hyperspace Effect
            this.starSystem.mesh.scaling.z = 60;

            // Loop
            if (this.starSystem.mesh.position.z < -2000) {
                this.starSystem.mesh.position.z = 2000;
            }

            // Hyperspace Tunnel FOV
            if (this.scene.activeCamera) {
                this.scene.activeCamera.fov = BABYLON.Scalar.Lerp(this.scene.activeCamera.fov, 1.5, 0.05);
            }
        } else {
            // DISENGAGE: Reset
            this.starSystem.mesh.position.z = 0;
            this.starSystem.mesh.scaling.z = 1; // [FIX] Reset Stretch

            // Return FOV
            if (this.scene.activeCamera) {
                this.scene.activeCamera.fov = BABYLON.Scalar.Lerp(this.scene.activeCamera.fov, 0.8, 0.1);
            }
        }
    },

    checkDockingProximity: function () {
        if (!this.shipBody || !this.systemMeshes) return;

        var minDist = 10000;
        var nearestStation = null;

        // Find nearest station
        this.systemMeshes.forEach(m => {
            if (m.name.startsWith("stationRoot_")) {
                var dist = BABYLON.Vector3.Distance(this.shipBody.absolutePosition, m.position);
                if (dist < minDist) {
                    minDist = dist;
                    nearestStation = m;
                }
            }
        });

        // Debug Log (Periodic)
        // if (this.frame % 120 === 0 && nearestStation) {
        //     console.log(`Docking Check: Closest=${nearestStation.name} Dist=${minDist.toFixed(1)}`);
        // }

        // Threshold = 50 units
        if (nearestStation && minDist < 50) {
            if (!this.canDock) {
                this.canDock = true;
                this.dockTargetId = nearestStation.name.substring(12); // Remove "stationRoot_"

                // Notify C# (Debounced)
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync("SetDockingAvailable", true, this.dockTargetId);
                }
            }
        } else {
            if (this.canDock) {
                this.canDock = false;
                this.dockTargetId = null;
                // Notify C#
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync("SetDockingAvailable", false, null);
                }
            }
        }
    },

    // --- Navigation & Visuals ---

    setupWaypoints: function () {
        if (this.guiTexture) return;
        this.guiTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.waypoints = [];
    },

    createWaypoint: function (mesh, labelText, color) {
        if (!this.guiTexture) this.setupWaypoints();

        // Container (Rect)
        var rect = new BABYLON.GUI.Rectangle();
        rect.width = "60px";
        rect.height = "60px";
        rect.thickness = 2;
        rect.color = color;
        rect.cornerRadius = 5;
        rect.linkOffsetY = -30;
        rect.isPointerBlocker = true; // Allow clicking
        this.guiTexture.addControl(rect);
        rect.linkWithMesh(mesh);

        // Right Click to Autopilot
        rect.onPointerClickObservable.add((evt) => {
            if (evt.buttonIndex === 2) { // Right Click
                console.log("Autopilot engaged to: " + labelText);
                this.autopilotTarget = mesh;
                this.isCruising = true;
            }
        });

        // Text (Distance)
        var label = new BABYLON.GUI.TextBlock();
        label.text = labelText;
        label.color = color;
        label.fontSize = 14;
        label.top = "40px";
        rect.addControl(label);

        // Store for updates (distance)
        this.waypoints.push({
            control: rect,
            label: label,
            mesh: mesh,
            baseText: labelText
        });
    },

    updateWaypoints: function () {
        if (!this.waypoints || !this.shipBody) return;

        this.waypoints.forEach(wp => {
            if (!wp.mesh || wp.mesh.isDisposed()) {
                wp.control.isVisible = false;
                return;
            }

            var dist = BABYLON.Vector3.Distance(this.shipBody.absolutePosition, wp.mesh.position);
            wp.label.text = wp.baseText + "\n" + Math.round(dist) + "m";

            // Check dot product to hide if behind camera
            var camForward = this.camera.getForwardRay().direction;
            var toMesh = wp.mesh.position.subtract(this.camera.position).normalize();
            var dot = BABYLON.Vector3.Dot(camForward, toMesh);

            if (dot < 0) wp.control.isVisible = false;
            else wp.control.isVisible = true;
        });
    },

    createSpaceDust: function () {
        // Space Dust for Velocity Sensation
        this.dustSPS = new BABYLON.SolidParticleSystem("dustSPS", this.scene, { updatable: true });
        // [FIX] Increase Size significantly (0.5 -> 3.0) for visibility
        // [FIX] Tuned Size (1.5) and Color (Silver) per user request
        var dustShape = BABYLON.MeshBuilder.CreatePlane("d", { size: 1.5 }, this.scene);

        // [FIX] Increase Density for "Speed Sensation"
        this.dustSPS.addShape(dustShape, 2000);
        dustShape.dispose();

        var mesh = this.dustSPS.buildMesh();
        mesh.hasVertexAlpha = true;

        // Material
        var mat = new BABYLON.StandardMaterial("dustMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.9); // Silver/White

        mat.disableLighting = true;
        mat.alpha = 0.8; // Brighten
        mesh.material = mat;

        // Init logic
        this.dustSPS.initParticles = () => {
            for (var p = 0; p < this.dustSPS.nbParticles; p++) {
                var particle = this.dustSPS.particles[p];
                // Box around origin (will represent camera pos)
                particle.position.x = (Math.random() - 0.5) * 400;
                particle.position.y = (Math.random() - 0.5) * 400;
                particle.position.z = (Math.random() - 0.5) * 800; // Longer on Z
                particle.color = new BABYLON.Color4(1, 1, 1, Math.random() * 0.5);
            }
        };

        this.dustSPS.initParticles();
        this.dustSPS.setParticles();
        this.dustMesh = mesh;
    },

    // --- Update Loop ---

    update: function () {
        if (!this.scene) return;

        // Sub-systems
        this.updateShip();
        this.updateLasers();
        this.checkCollisions();
        this.checkGateCollisions();
        this.checkDockingProximity();
        this.updateSpaceDust();
        this.updateWaypoints();
        this.updateWarpEffect();
        this.updateRadar(); // [FIX] Restore Radar
    },

    updateSpaceDust: function () {
        if (!this.dustSPS || !this.camera) return;

        // Move dust to follow camera roughly
        // We use a "wrapping" logic.
        // We actually want the particles to act like they are static in the world
        // but we just move the "box" and wrap particles that fall out.

        var camPos = this.camera.position;

        this.dustSPS.updateParticle = (particle) => {
            // Wrap Z
            if (particle.position.z < camPos.z - 400) particle.position.z += 800;
            else if (particle.position.z > camPos.z + 400) particle.position.z -= 800;

            // Wrap X
            if (particle.position.x < camPos.x - 200) particle.position.x += 400;
            else if (particle.position.x > camPos.x + 200) particle.position.x -= 400;

            // Wrap Y
            if (particle.position.y < camPos.y - 200) particle.position.y += 400;
            else if (particle.position.y > camPos.y + 200) particle.position.y -= 400;
        };

        this.dustSPS.setParticles();
    },

    updateRadar: function () {
        var canvas = document.getElementById("radarCanvas");
        if (!canvas) return;
        var ctx = canvas.getContext("2d");
        var w = canvas.width;
        var h = canvas.height;
        var cx = w / 2;
        var cy = h / 2;
        var range = 5000; // [FIX] Increased from 2000 to 5000 to see full sector

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Draw Rings
        ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, w / 2 - 5, 0, Math.PI * 2); // Outer (5000)
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, w / 4, 0, Math.PI * 2); // Inner (2500)
        ctx.stroke();

        // Draw Ship (Rotating Arrow)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.ship.rotation.y); // Rotate to match heading

        ctx.fillStyle = "cyan";
        ctx.beginPath();
        ctx.moveTo(0, -8); // Tip (Relative to Center)
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.fill();

        // Heading Line
        ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, -20);
        ctx.stroke();
        ctx.restore();

        if (!this.shipBody || !this.systemMeshes) return;

        // Draw Objects (Fixed Orientation)
        this.systemMeshes.forEach(m => {
            if (!m.isEnabled()) return;

            var relPos = m.position.subtract(this.shipBody.absolutePosition);

            // [FIX] No rotation of the world. World is fixed (North Up).
            var rx = relPos.x;
            var rz = relPos.z;

            // Map x/z to canvas x/y (Radar is Top Down)
            var mapX = cx + (rx / range) * (w / 2);
            var mapY = cy - (rz / range) * (h / 2);

            // Clamp to bounds (Circular)
            var dist = Math.sqrt((mapX - cx) * (mapX - cx) + (mapY - cy) * (mapY - cy));
            if (dist > w / 2 - 5) {
                return; // Skip out of range for now
            }

            // Color
            if (m.name.startsWith("gateRoot_")) ctx.fillStyle = "cyan";
            else if (m.name.startsWith("stationRoot_")) ctx.fillStyle = "lime";
            else if (m.name.startsWith("planet_")) ctx.fillStyle = "blue";
            else if (m.name.startsWith("enemy_")) ctx.fillStyle = "red";
            else return; // Don't draw unknown stuff

            // Draw Dot
            ctx.beginPath();
            ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
            ctx.fill();
        });
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
        this.ship.position = new BABYLON.Vector3(0, 0, -200); // [FIX] Spawn safely away from Sun/Gates

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
        engineMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0.8); // Dim Blue (Idle)
        engine.material = engineMat;

        this.ship.engineMat = engineMat; // [NEW] Expose for updates

        // [NEW] Wingtip Trails
        var leftTip = new BABYLON.TransformNode("leftTip", this.scene);
        leftTip.parent = wings;
        leftTip.position.x = -2.0; // Left Edge

        var rightTip = new BABYLON.TransformNode("rightTip", this.scene);
        rightTip.parent = wings;
        rightTip.position.x = 2.0; // Right Edge

        // Trails
        var trailMat = new BABYLON.StandardMaterial("trailMat", this.scene);
        trailMat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.9); // Silver/White
        trailMat.disableLighting = true;

        // [FIX] Reduce Trail Size again (0.1 -> 0.05)
        var trail1 = new BABYLON.TrailMesh("trail1", leftTip, this.scene, 0.05, 60, true);
        trail1.material = trailMat;

        var trail2 = new BABYLON.TrailMesh("trail2", rightTip, this.scene, 0.05, 60, true);
        trail2.material = trailMat;
    },

    updateShip: function () {
        if (!this.ship) return;

        var dt = this.engine.getDeltaTime() / 1000;

        // Debug Log (Periodic)
        if (this.frame % 120 === 0) {
            console.log(`Ship Status: DT=${dt.toFixed(4)} Cruising=${this.isCruising} Pos=${this.ship.position.toString()}`);
        }

        var speed = 40; // Doubled Speed
        var speed = 40; // Speed
        var forward = this.ship.forward;
        var movement = BABYLON.Vector3.Zero();
        var isThrusting = false;

        // Autopilot
        if (this.autopilotTarget) {
            var targetPos = this.autopilotTarget.absolutePosition || this.autopilotTarget.position;

            this.ship.lookAt(targetPos);
            this.isCruising = true; // Auto-engage thrust

            // Check distance
            var dist = BABYLON.Vector3.Distance(this.ship.position, targetPos);
            if (dist < 20) {
                this.isCruising = false;
                this.autopilotTarget = null;
                this.frame = 0;
                console.log("Autopilot: Arrived at target.");
            }
        }

        // Input or Autopilot Thrust
        if (this.inputMap["w"] || this.isCruising) {
            movement.addInPlace(forward);
            isThrusting = true;
        }
        if (this.inputMap["s"]) {
            movement.subtractInPlace(forward);
            isThrusting = true;
        }

        // Strafe
        if (this.inputMap["a"]) {
            movement.subtractInPlace(this.ship.right);
        }
        if (this.inputMap["d"]) {
            movement.addInPlace(this.ship.right);
        }

        this.ship.position.addInPlace(movement.scale(speed * dt));

        // [NEW] Engine Glow Logic
        if (this.ship.engineMat) {
            if (isThrusting) {
                this.ship.engineMat.emissiveColor = new BABYLON.Color3(0.5, 0.8, 1); // Bright White/Blue
            } else {
                this.ship.engineMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0.8); // Dim Blue
            }
        }

        // [NEW] Solar Wind (Dust Scaling)
        if (this.dustMesh) {
            if (this.isWarping) {
                this.dustMesh.scaling.z = BABYLON.Scalar.Lerp(this.dustMesh.scaling.z, 40, 0.05); // Hyper Streak
            } else if (isThrusting) {
                this.dustMesh.scaling.z = BABYLON.Scalar.Lerp(this.dustMesh.scaling.z, 5, 0.1); // Speed Lines
            } else {
                this.dustMesh.scaling.z = BABYLON.Scalar.Lerp(this.dustMesh.scaling.z, 1, 0.1); // Dots
            }
        }

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
            this.ship.position = new BABYLON.Vector3(0, 0, -200); // safe entry point
            this.ship.rotation = BABYLON.Vector3.Zero();
            this.ship.rotationQuaternion = null;
        }
    },

};
