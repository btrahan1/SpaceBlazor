window.spaceRenderer = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,

    // [NEW] Sound Manager
    sfx: {
        ctx: null,
        masterGain: null,
        isMuted: false,
        engineOsc: null,
        engineGain: null,
        isInit: false,

        init: function () {
            if (this.isInit) return;
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.5; // 50% Volume
                this.masterGain.connect(this.ctx.destination);

                // Create Noise Buffer for Explosions
                this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
                var data = this.noiseBuffer.getChannelData(0);
                for (var i = 0; i < this.ctx.sampleRate * 2; i++) {
                    data[i] = Math.random() * 2 - 1;
                }

                this.isInit = true;
                console.log("Audio System Initialized.");
            } catch (e) {
                console.warn("WebAudio not supported.");
            }
        },

        setMute: function (muted) {
            this.isMuted = muted;
            if (this.masterGain) {
                this.masterGain.gain.setValueAtTime(muted ? 0 : 0.5, this.ctx.currentTime);
            }
            // Stop engine if muted
            if (muted && this.engineOsc) {
                this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
            }
        },

        laser: function (isEnemy) {
            if (!this.isInit || this.isMuted) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            var now = this.ctx.currentTime;

            // OSC 1: The "Crunch" (Body)
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            osc.type = isEnemy ? 'square' : 'sawtooth';

            var startFreq = isEnemy ? 200 : 350;
            var endFreq = isEnemy ? 40 : 50;
            var dur = isEnemy ? 0.4 : 0.25;

            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + dur);

            // [RESTORED] OSC 2: The "Zing" (Metal Tail) - Player Only
            if (!isEnemy) {
                var osc2 = this.ctx.createOscillator();
                var gain2 = this.ctx.createGain();
                osc2.type = 'sine';

                // High Pitch Sweep "Peeeww...innng" (Star Wars Blaster)
                osc2.frequency.setValueAtTime(2500, now); // Higher start
                osc2.frequency.exponentialRampToValueAtTime(200, now + 0.7); // Long drop

                gain2.gain.setValueAtTime(0.2, now);
                gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

                osc2.connect(gain2);
                gain2.connect(this.masterGain);
                osc2.start(now);
                osc2.stop(now + 0.7);
            }
        },

        explosion: function () {
            if (!this.isInit || this.isMuted) return;

            var src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;

            var filter = this.ctx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = 1000;

            var gain = this.ctx.createGain();
            var now = this.ctx.currentTime;

            gain.gain.setValueAtTime(1.0, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            src.start(now);
            src.stop(now + 1.0);
        },

        // Engine Hum
        updateEngine: function (speedRatio) {
            if (!this.isInit || this.isMuted) return;
            // [NEW] Silence if Landing or Landed
            if (window.spaceRenderer.isLanding || window.spaceRenderer.isLanded) { // Access via global or ensure scope
                // We can't access 'this.isLanded' easily inside SFX object unless we bind or pass it.
                // Actually sfx is a property of spaceRenderer, so 'this' is sfx.
                // We need to pass the state or check parent.
                // Easier: Modify updateShip to NOT call this function if landed.

                // Fallback silence
                if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
                return;
            }

            // [FIX] Ensure Context is Awake
            if (this.ctx.state === 'suspended') this.ctx.resume();

            // Lazy Init Engine
            if (!this.engineOsc) {
                this.engineOsc = this.ctx.createOscillator();
                this.engineGain = this.ctx.createGain();
                this.engineFilter = this.ctx.createBiquadFilter();

                // [Spacey] Triangle Wave = Electric/Magnetic Hum
                this.engineOsc.type = 'triangle';
                this.engineOsc.frequency.value = 60; // 60Hz Base Hum

                // [Spacey] Lowpass with Resonance (Q) = Turbine Whine
                this.engineFilter.type = 'lowpass';
                this.engineFilter.frequency.value = 400;
                this.engineFilter.Q.value = 5; // Resonant Peak for the "Whistle"

                this.engineOsc.connect(this.engineFilter);
                this.engineFilter.connect(this.engineGain);
                this.engineGain.connect(this.masterGain);

                this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
                this.engineOsc.start();
            }

            var now = this.ctx.currentTime;

            // [Spacey] Ion Drive Logic
            // Pitch: 60Hz -> 200Hz (Electric wind-up)
            var targetFreq = 50 + (speedRatio * 150);

            // Filter: 300Hz -> 1500Hz (Opening the intake/whine)
            var targetCutoff = 300 + (speedRatio * 1200);

            this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
            this.engineFilter.frequency.setTargetAtTime(targetCutoff, this.ctx.currentTime, 0.1);

            // Volume: 0.1 (Idle Hum) -> 0.4 (Full Thrust)
            var targetVol = 0.1 + (speedRatio * 0.3);
            this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
        }
    },

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
        this.lasers = []; // [FIX] Reverted to 'lasers' to match existing updateLasers function
        this.lastShotTime = 0; // [NEW] Cooldown
        this.enemies = [];
        this.enemyProjectiles = []; // [NEW] Enemy Lasers
        this.createEnemies();
        this.createRaiders(); // [NEW] Spawn Raiders

        // Camera (Follow Ship)
        // Parameters: Name, Position, Scene
        this.camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), this.scene);
        this.camera.radius = 15; // How far from the object to follow
        this.camera.heightOffset = 5; // How high above the object to place the camera
        this.camera.rotationOffset = 180; // The viewing angle
        this.camera.cameraAcceleration = 0.05; // How fast to move
        this.camera.maxCameraSpeed = 20; // Speed limit
        this.camera.lockedTarget = this.ship; // Target the ship

        // [NEW] Cinematic Camera (for Landings/Cutscenes)
        this.cinematicCamera = new BABYLON.UniversalCamera("CinematicCam", new BABYLON.Vector3(0, 0, 0), this.scene);
        this.cinematicCamera.rotation = new BABYLON.Vector3(0, 0, 0);

        // this.camera.attachControl(this.canvas, true); // DISABLED: Using Custom Ship Steering

        // Input Handling
        this.inputMap = {};
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
            var key = evt.sourceEvent.key.toLowerCase();
            this.inputMap[key] = evt.sourceEvent.type == "keydown";

            // Toggle Cruise Control (Shift + R)
            if (key === "r" && evt.sourceEvent.shiftKey && evt.sourceEvent.type == "keydown") {
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

            // Shift+L: Auto-Land (Cheat/Fast Travel)
            if (key === "l" && evt.sourceEvent.shiftKey && evt.sourceEvent.type == "keydown") {
                this.forceLandNearest();
            }

            // Fire Laser on Space (Single Press)
            if (key === " " && evt.sourceEvent.type == "keydown") {
                console.log("Input: SPACE KEY DETECTED");
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
                    // Audio Init
                    this.sfx.init();

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

            var sensitivity = 0.001; // [FIX] Reduced from 0.002
            var dx = pointerInfo.event.movementX || 0;
            var dy = pointerInfo.event.movementY || 0;

            if (this.ship) {
                if (this.ship.rotationQuaternion) this.ship.rotationQuaternion = null;

                this.ship.rotation.y += dx * sensitivity;
                this.ship.rotation.x += dy * sensitivity;

                this.targetRoll = -dx * 0.1; // [FIX] Reduced Roll Effect (was 0.5)
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

        // [NEW] Reset Combat (Spawn Enemies)
        this.resetCombat();

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
            if (this.dotNetRef) {
                this.dotNetRef.invokeMethodAsync("SetDockingAvailable", false, null);
            }
        }
    },

    // [NEW] Landing Logic
    checkLandingProximity: function () {
        if (!this.shipBody || !this.systemMeshes) return;

        var minDist = 10000;
        var nearestPlanet = null;

        // Find nearest planet
        this.systemMeshes.forEach(m => {
            if (m.name.startsWith("planet_")) {
                var dist = BABYLON.Vector3.Distance(this.shipBody.absolutePosition, m.position);
                // Size of planet usually ~200-500. Distance needs to be relative to surface.
                // Let's say < 400 units from center (assuming avg radius 100-200)
                if (dist < 400 && dist < minDist) {
                    minDist = dist;
                    nearestPlanet = m;
                }
            }
        });

        if (nearestPlanet) {
            if (!this.canLand) { // Change State
                this.canLand = true;
                this.landingTarget = nearestPlanet;
                var pName = nearestPlanet.name.substring(7); // Remove "planet_"

                // Notify C# 
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync("SetLandingAvailable", true, pName);
                }
            }
        } else {
            if (this.canLand) {
                this.canLand = false;
                this.landingTarget = null;
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync("SetLandingAvailable", false, null);
                }
            }
        }

        // Input: L to Land
        if (this.canLand && this.inputMap["l"] && !this.inputMap["shift"]) {
            this.startLandingSequence();
        }
    },

    forceLandNearest: function () {
        if (!this.systemMeshes || this.isLanding) return;

        var minDist = 999999;
        var nearestPlanet = null;

        this.systemMeshes.forEach(m => {
            if (m.name.startsWith("planet_")) {
                var dist = BABYLON.Vector3.Distance(this.ship.position, m.position);
                if (dist < minDist) {
                    minDist = dist;
                    nearestPlanet = m;
                }
            }
        });

        if (nearestPlanet) {
            console.log("Auto-Landing at " + nearestPlanet.name);

            // 1. Set Target
            this.landingTarget = nearestPlanet;

            // 2. Teleport Ship to Approach Vector (600 units out from planet center)
            // Vector from Planet to Ship (or default Z if too close/inside)
            var dir = this.ship.position.subtract(nearestPlanet.position).normalize();
            if (dir.length() < 0.1) dir = new BABYLON.Vector3(0, 0, 1);

            var approachPos = nearestPlanet.position.add(dir.scale(600));
            this.ship.position.copyFrom(approachPos);
            // Look at planet
            this.ship.lookAt(nearestPlanet.position);

            // 3. Start Sequence
            this.startLandingSequence();
        }
    },

    startLandingSequence: function () {
        if (this.isLanding) return;
        this.isLanding = true;
        console.log("Initiating Cinematic Landing (5s)...");

        // 1. Disable Controls
        document.exitPointerLock();
        this.isCruising = false;

        // 2. Audio: Kill Engine Hum immediatley
        // 2. Audio: Kill Engine Hum immediatley
        if (this.sfx.engineGain) this.sfx.engineGain.gain.setTargetAtTime(0, this.sfx.ctx.currentTime, 0.5);

        // 3. Camera Switch: Main -> Cinematic
        if (this.cinematicCamera && this.camera) {
            // Match main camera pos/rot
            this.cinematicCamera.position.copyFrom(this.camera.position);
            // UniversalCam needs rotation (Quaternion vs Euler is tricky), but FollowCam usually sets rotation to look at target.
            this.cinematicCamera.setTarget(this.ship.position);

            // Activate
            this.scene.activeCamera = this.cinematicCamera;
        }

        // 4. Camera Animation (Move to Chase View)
        var startCamPos = this.cinematicCamera.position.clone();
        var camOffset = this.ship.forward.scale(-40).add(this.ship.up.scale(15)); // High & Behind
        var targetCamPos = this.ship.position.add(camOffset);

        var animCam = new BABYLON.Animation("camPos", "position", 60, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animCam.setKeys([{ frame: 0, value: startCamPos }, { frame: 60, value: targetCamPos }]);
        this.cinematicCamera.animations = [animCam];
        this.scene.beginAnimation(this.cinematicCamera, 0, 60, false);

        // 5. Ship Descent Animation (5 Seconds = 300 frames)
        var startShipPos = this.ship.position.clone();
        var planetPos = this.landingTarget.position.clone();
        // Aim for "atmosphere" (radius + something)
        var direction = planetPos.subtract(startShipPos).normalize();
        var descentEndPos = startShipPos.add(direction.scale(400)); // Fly 400 units towards planet

        var animShip = new BABYLON.Animation("shipDescent", "position", 60, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animShip.setKeys([{ frame: 0, value: startShipPos }, { frame: 300, value: descentEndPos }]);
        this.ship.animations = [animShip];
        this.scene.beginAnimation(this.ship, 0, 300, false);

        // 6. FX Loop (Shake + LookAt)
        var frame = 0;
        var duration = 300;
        var burnObserver = this.scene.onBeforeRenderObservable.add(() => {
            frame++;
            if (frame > duration) {
                this.scene.onBeforeRenderObservable.remove(burnObserver);
                return;
            }

            // Keep Camera looking at Ship
            if (this.cinematicCamera) this.cinematicCamera.setTarget(this.ship.position);

            // Shake (Increases with time)
            var intensity = (frame / duration) * 3.0; // Stronger Shake (0 -> 3.0)
            var shake = new BABYLON.Vector3((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
            if (this.cinematicCamera) this.cinematicCamera.position.addInPlace(shake);
        });

        // 7. Transition
        setTimeout(() => {
            this.enterPlanetMode();
            if (this.dotNetRef) {
                this.dotNetRef.invokeMethodAsync("EnterPlanet");
            }
            this.isLanding = false;
        }, 5000);
    },

    enterPlanetMode: function () {
        this.isLanded = true;
        // Force Silence
        if (this.sfx && this.sfx.engineGain) {
            this.sfx.engineGain.gain.cancelScheduledValues(this.sfx.ctx.currentTime);
            this.sfx.engineGain.gain.setValueAtTime(0, this.sfx.ctx.currentTime);
        }
    },

    exitPlanetMode: function () {
        this.isLanded = false;

        // Restore Main Camera
        if (this.camera) this.scene.activeCamera = this.camera;

        // Reset Ship (Safe Distance)
        this.resetShip();
        console.log("Exited Planet Mode.");
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

        try {
            if (this.isLanded) return; // [NEW] PAUSE SIMULATION when Landed

            this.updateShip();
            // Don't update enemies/lasers if landed? 
            if (!this.isLanding) { // Also pause combat during landing cinematic? Maybe kept for drama?
                this.updateLasers();
                this.updateEnemies();
                this.checkCollisions();
            }
            this.checkGateCollisions();
            this.checkDockingProximity();
            this.updateSpaceDust();
            this.updateWaypoints();
            this.updateWarpEffect();
            this.updateWaypoints();
            this.updateWarpEffect();
            this.updateRadar();

            // [NEW] Landing Check
            this.checkLandingProximity();
        } catch (e) {
            console.error("Render Loop Error:", e);
        }
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
            else return;

            // Draw Dot
            ctx.beginPath();
            ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // [new] Draw Enemies
        if (this.enemies) {
            ctx.fillStyle = "red";
            this.enemies.forEach(e => {
                if (e.isDisposed()) return;
                var relPos = e.position.subtract(this.shipBody.absolutePosition);
                var rx = relPos.x;
                var rz = relPos.z;
                var mapX = cx + (rx / range) * (w / 2);
                var mapY = cy - (rz / range) * (h / 2);

                // Check Bounds
                var dist = Math.sqrt((mapX - cx) * (mapX - cx) + (mapY - cy) * (mapY - cy));
                if (dist > w / 2 - 5) return;

                if (dist > w / 2 - 5) return;

                if (e.type === "raider") {
                    // Draw Purple X
                    ctx.strokeStyle = "#D000FF"; // Bright Purple
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(mapX - 4, mapY - 4);
                    ctx.lineTo(mapX + 4, mapY + 4);
                    ctx.moveTo(mapX + 4, mapY - 4);
                    ctx.lineTo(mapX - 4, mapY + 4);
                    ctx.stroke();
                } else {
                    // Draw Red Dot (Drone)
                    ctx.fillStyle = "red";
                    ctx.beginPath();
                    ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }
    },

    createEnemies: function () {
        var mat = new BABYLON.StandardMaterial("enemyMat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(0.5, 0, 0);

        // Spawn 10 Drones
        for (var i = 0; i < 10; i++) {
            // Drone Body
            var enemy = BABYLON.MeshBuilder.CreateSphere("enemy" + i, { diameter: 6, segments: 8 }, this.scene);

            // Spikes (Visual Aggression)
            var spike = BABYLON.MeshBuilder.CreateCylinder("s", { height: 12, diameter: 1 }, this.scene);
            spike.parent = enemy;
            spike.rotation.x = Math.PI / 2;

            var spike2 = spike.clone();
            spike2.parent = enemy;
            spike2.rotation.y = Math.PI / 2;

            // Random Position
            var x = (Math.random() - 0.5) * 400;
            var y = (Math.random() - 0.5) * 200;
            var z = 100 + (Math.random() * 400);

            enemy.position = new BABYLON.Vector3(x, y, z);
            enemy.material = mat;
            enemy.material = mat;
            enemy.hp = 3; // Health
            enemy.type = "drone"; // [NEW] AI Type

            this.enemies.push(enemy);
        }
    },

    createRaiders: function () {
        var matBody = new BABYLON.StandardMaterial("raiderBody", this.scene);
        matBody.diffuseColor = new BABYLON.Color3(0.6, 0.4, 0.9); // Light Purple
        matBody.specularColor = new BABYLON.Color3(1, 1, 1);
        matBody.emissiveColor = new BABYLON.Color3(0.1, 0.0, 0.2);

        var matWing = new BABYLON.StandardMaterial("raiderWing", this.scene);
        matWing.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Dark Grey
        matWing.emissiveColor = new BABYLON.Color3(0.8, 0, 1); // Purple Trim

        var matEngine = new BABYLON.StandardMaterial("raiderEngine", this.scene);
        matEngine.emissiveColor = new BABYLON.Color3(0, 1, 1); // Cyan Glow

        // Spawn 3 Raiders
        for (var i = 0; i < 3; i++) {
            // Root Node (Driver) - Handles AI Movement
            var root = new BABYLON.TransformNode("raider" + i, this.scene);

            // Visual Node (Mesh) - Handles Banking/Animation
            var vis = new BABYLON.TransformNode("raiderVis" + i, this.scene);
            vis.parent = root;

            // Design: "Viper" Style
            // Fuselage (Long Hexagon)
            var body = BABYLON.MeshBuilder.CreateCylinder("r_body", { height: 12, diameter: 2, tessellation: 6 }, this.scene);
            body.parent = vis;
            body.rotation.x = Math.PI / 2;
            body.scaling.x = 0.8; // Flatten slightly
            body.material = matBody;

            // Nose Cone
            var nose = BABYLON.MeshBuilder.CreateCylinder("r_nose", { height: 4, diameterBottom: 2, diameterTop: 0, tessellation: 6 }, this.scene);
            nose.parent = vis;
            nose.rotation.x = Math.PI / 2;
            nose.position.z = 8; // In front
            nose.material = matBody;

            // Wings (Swept Back)
            var lWing = BABYLON.MeshBuilder.CreateBox("lWing", { width: 6, height: 0.2, depth: 4 }, this.scene);
            lWing.parent = vis;
            lWing.position.x = -2.5;
            lWing.position.z = -2;
            lWing.rotation.y = -Math.PI / 4; // Sweep back
            lWing.material = matWing;

            var rWing = lWing.clone();
            rWing.parent = vis;
            rWing.position.x = 2.5;
            rWing.rotation.y = Math.PI / 4; // Sweep back

            // Engines (Big Blocks)
            var engineL = BABYLON.MeshBuilder.CreateBox("engL", { width: 1.5, height: 1.5, depth: 4 }, this.scene);
            engineL.parent = vis;
            engineL.position.x = -1.5;
            engineL.position.z = -5;
            engineL.material = matBody;

            var engineR = engineL.clone();
            engineR.parent = vis;
            engineR.position.x = 1.5;

            // Glows
            var glowL = BABYLON.MeshBuilder.CreatePlane("glowL", { size: 1.2 }, this.scene);
            glowL.parent = engineL;
            glowL.position.z = -2.01;
            glowL.rotation.y = Math.PI;
            glowL.material = matEngine;

            var glowR = glowL.clone();
            glowR.parent = engineR;

            // Physics Stats
            var x = (Math.random() - 0.5) * 800;
            var z = 300 + (Math.random() * 500);

            root.position = new BABYLON.Vector3(x, 0, z);
            root.hp = 10;
            root.type = "raider";
            root.lastShot = 0;

            // Reference the Visual for Banking Logic
            root.visual = vis;

            // Hitbox hack: Since root is a TransformNode, we need a hitbox.
            // Let's attach a simplified hitbox to the root for collision logic
            // Actually, existing logic checks intersectsMesh.
            // We need a mesh on the root? Or we just assume the 'body' is close enough?
            // The lasers check 'intersectsMesh(enemy)'. 'enemy' is 'root'.
            // Root has no geometry. Collision will FAIL.
            // FIX: Create an invisible box on the Root for collision.
            var hitbox = BABYLON.MeshBuilder.CreateBox("hitbox", { width: 6, height: 3, depth: 12 }, this.scene);
            hitbox.parent = root;
            hitbox.isVisible = false;
            root.hitbox = hitbox; // Store it if needed, but 'intersectsMesh' works on the hitbox if we pass the hitbox to the array?

            // Wait, our collision logic (line 910) loops 'this.enemies'.
            // If 'this.enemies[j]' is 'root' (TransformNode), intersectsMesh fails.
            // We should push the HITBOX to the enemies array?
            // But then movement logic fails because we move the hitbox, does it move the visual?
            // Yes, visual is sibling? No visual is child of root? 
            // If Hitbox is child of Root, and we move Root, Hitbox moves. OK.
            // But we pushed Root to 'enemies'.
            // laser.intersectsMesh(root) -> Error/False.
            // We need to modify checkCollisions to check Children? Or just push the hitbox?
            // Safer: Push the ROOT to 'enemies', and modify checkCollisions to check 'enemy.hitbox || enemy'.

            this.enemies.push(root);
        }
    },

    shootLaser: function () {
        console.log("shootLaser: Invoked");
        if (!this.ship) { console.log("shootLaser: No Ship"); return; }

        var now = Date.now();
        var diff = now - (this.lastShotTime || 0); // Handle undefined safely
        console.log("shootLaser: Cooldown Check. Diff:", diff);

        if (diff < 250) return; // 250ms Cooldown
        this.lastShotTime = now;

        // [FIX] Dynamic Hardpoints
        var offsets = [];
        var count = this.hardpointCount || 2;

        if (count === 1) {
            offsets = [0]; // Center
        } else if (count === 4) {
            offsets = [-1.5, 1.5, -3.5, 3.5]; // Quad Spread
        } else {
            offsets = [-2.5, 2.5]; // Dual (Default)
        }

        // Ensure Matrix is fresh
        this.ship.computeWorldMatrix(true);
        var mat = this.ship.getWorldMatrix();
        var rightDir = BABYLON.Vector3.TransformNormal(BABYLON.Axis.X, mat).normalize();
        var forwardDir = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, mat).normalize();

        offsets.forEach(offset => {
            // Visuals: Green Bolt (Longer Beam: Depth 6 -> 24)
            var laser = BABYLON.MeshBuilder.CreateBox("laser", { width: 1.0, height: 1.0, depth: 24 }, this.scene);

            // Start at ship position + Offset
            // Use calculated Right Vector
            var right = rightDir.scale(offset);

            laser.position = this.ship.position.add(right);

            // Match Ship Rotation
            if (this.ship.rotationQuaternion) {
                laser.rotationQuaternion = this.ship.rotationQuaternion.clone();
            } else {
                laser.rotation.copyFrom(this.ship.rotation);
            }

            // Color
            var laserMat = new BABYLON.StandardMaterial("laserMat", this.scene);
            laserMat.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green Laser
            laserMat.disableLighting = true;
            laser.material = laserMat;

            // Velocity (Always forward relative to ship)
            laser.direction = forwardDir.scale(5); // Speed 5

            // SFX
            this.sfx.laser(false); // Player Laser

            console.log("Laser Spawned!", { pos: laser.position.toString(), dir: laser.direction.toString() });

            // Despawn Timer
            laser.life = 120; // [FIX] Range Doubled (2 seconds @ 60fps)

            this.lasers.push(laser);
        });
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

                // Check collision against Mesh or Hitbox
                var hitTarget = enemy.hitbox ? enemy.hitbox : enemy;

                // Safety Check: TransformNodes don't have intersectsMesh
                if (!hitTarget.intersectsMesh) continue;

                if (laser.intersectsMesh(hitTarget, true)) { // [FIX] Support Hitbox
                    // HIT!
                    this.createExplosion(enemy.position);

                    // Reduce HP
                    enemy.hp--;

                    // Flash Red
                    if (enemy.visual) {
                        // Flash all children
                        enemy.visual.getChildren().forEach(m => {
                            if (m.material && m.material.emissiveColor) {
                                var old = m.material.emissiveColor.clone();
                                m.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
                                setTimeout(() => { if (!m.isDisposed()) m.material.emissiveColor = old; }, 100);
                            }
                        });
                    } else {
                        // Simple Drone
                        enemy.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
                        setTimeout(() => { if (!enemy.isDisposed()) enemy.material.emissiveColor = new BABYLON.Color3(0.5, 0, 0); }, 100);
                    }

                    // Dead?
                    if (enemy.hp <= 0) {
                        enemy.dispose();
                        this.enemies.splice(j, 1);
                        this.createExplosion(enemy.position); // Big Boom
                        this.sfx.explosion(); // SFX

                        // [NEW] Bounty Reward
                        var reward = (enemy.type === "raider") ? 1000 : 250;
                        if (this.dotNetRef) {
                            this.dotNetRef.invokeMethodAsync("AddBounty", reward);
                        }
                    }

                    // Laser hits: Destroy it and stop checking enemies
                    laser.dispose();
                    this.lasers.splice(i, 1);
                    break;
                }
            }
        }
    },

    // [NEW] Call this when entering a new sector to respawn enemies
    resetCombat: function () {
        // Clear old
        if (this.enemies) {
            this.enemies.forEach(e => { if (e.visual) e.visual.dispose(); e.dispose(); });
        }
        if (this.enemyProjectiles) {
            this.enemyProjectiles.forEach(p => p.dispose());
        }

        this.enemies = [];
        this.enemyProjectiles = [];

        // Spawn New
        this.createEnemies();
        this.createRaiders();

        console.log("Combat Reset: Enemies Spawned.");
    },

    updateEnemies: function () {
        if (!this.enemies || !this.ship) return;
        this.enemies.forEach(enemy => {
            var dist = BABYLON.Vector3.Distance(enemy.position, this.ship.position);

            if (dist < 300) { // Aggro Range
                // [FIX] Smooth Rotation (Vector Fly-by-Wire)
                // Instead of snapping to target, we slowly rotate our forward vector towards it.
                var targetDir = this.ship.position.subtract(enemy.position).normalize();
                var currentDir = enemy.forward; // Babylon uses .forward for Z-axis

                // Lerp limit turn rate (0.01 = Heavy Ship, 0.05 = Agile Drone)
                var turnRate = (enemy.type === "raider") ? 0.01 : 0.05;
                var newDir = BABYLON.Vector3.Lerp(currentDir, targetDir, turnRate).normalize();

                // Look at the new point in front of us
                enemy.lookAt(enemy.position.add(newDir));

                // [NEW] AI Type Behavior
                if (enemy.type === "raider") {
                    // Banking Logic (Roll based on Turn)
                    if (enemy.visual) {
                        // Calculate "Turn Amount" (How far right/left is the target?)
                        // Dot product of Right Vector vs Target Direction
                        var right = enemy.right; // Babylon TransformNode axis
                        var turnFactor = BABYLON.Vector3.Dot(right, targetDir);
                        // turnFactor: +1 (Right), -1 (Left), 0 (Straight)

                        // Target Roll: -45deg to +45deg (inverted? Left turn -> Bank Left (Roll +?))
                        // In Babylon LH: Rotation Z positive = CCW (Roll Right?)
                        // Let's try: Turn Right (+Factor) -> Roll Right (-Z?)
                        // It's usually Turn Right -> Bank Right (Right Wing Down).

                        var targetRoll = -turnFactor * (Math.PI / 2.1); // ~85 degrees (Hard Bank)

                        // Pitch? (Up/Down)
                        // var upFactor = BABYLON.Vector3.Dot(enemy.up, targetDir);
                        // var targetPitch = -upFactor * (Math.PI / 4);

                        // Smoothly Lerp Rotation Z
                        enemy.visual.rotation.z = BABYLON.Scalar.Lerp(enemy.visual.rotation.z, targetRoll, 0.05); // Slow roll
                    }

                    // Slower but Shoots
                    var speed = 0.8; // [FIX] Increased 0.6 -> 0.8 to keep momentum 
                    // Drone=0.125 is VERY slow.
                    // Let's make Raider 0.5 (Still very slow)

                    if (dist > 50) enemy.translate(BABYLON.Axis.Z, 0.5, BABYLON.Space.LOCAL);

                    // Shoot?
                    // If aiming roughly at player
                    var angle = BABYLON.Vector3.GetAngleBetweenVectors(enemy.forward, targetDir, BABYLON.Vector3.Up());
                    // Angle is in radians. 0.2 rad ~ 11 degrees.
                    if (Math.abs(angle) < 0.2) {
                        this.enemyShoot(enemy);
                    }

                } else {
                    // Drone Behavior (Chaser)
                    if (dist > 30) {
                        enemy.translate(BABYLON.Axis.Z, 0.125, BABYLON.Space.LOCAL);
                    } else {
                        enemy.translate(BABYLON.Axis.X, 0.05, BABYLON.Space.LOCAL);
                    }
                }
            }
        });

        // [NEW] Update Enemy Projectiles
        this.updateEnemyProjectiles();
    },

    enemyShoot: function (enemy) {
        var now = Date.now();
        if (now - (enemy.lastShot || 0) < 1000) return; // 1 sec Fire Rate
        enemy.lastShot = now;

        var laser = BABYLON.MeshBuilder.CreateBox("eLaser", { width: 0.5, height: 0.5, depth: 12 }, this.scene);
        laser.position = enemy.position.clone();
        laser.lookAt(this.ship.position); // Aim at player current pos

        var mat = new BABYLON.StandardMaterial("eLaserMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red
        mat.disableLighting = true;
        laser.material = mat;

        laser.direction = laser.forward.scale(2); // Reduced speed vs Player (5)
        laser.life = 100;

        this.sfx.laser(true); // Enemy Laser

        this.enemyProjectiles.push(laser);
    },

    updateEnemyProjectiles: function () {
        for (var i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            var laser = this.enemyProjectiles[i];
            laser.position.addInPlace(laser.direction);
            laser.life--;

            // Check Hit Player
            if (this.shipBody && laser.intersectsMesh(this.shipBody, true)) {
                // HIT PLAYER
                console.log("WARNING: SHIELD HIT!");
                // Visual? Flash HUD?
                // For now, simple console

                laser.dispose();
                this.enemyProjectiles.splice(i, 1);
                continue;
            }

            if (laser.life <= 0) {
                laser.dispose();
                this.enemyProjectiles.splice(i, 1);
            }
        }
    },

    createExplosion: function (position) {
        var particleSystem = new BABYLON.ParticleSystem("explosion", 200, this.scene);
        // Use a default particle texture (or create one dynamically if needed)
        // For now, we assume a texture exists or we use a noise texture? 
        // Actually, let's try to use a default or just colored squares if texture is missing.
        // But Babylon usually needs a texture. 
        // We can create a schematic texture?
        // Let's use a URL if possible or just skip texture and rely on color? 
        // Particles without texture might be invisible. 
        // Workaround: Create a pixel texture.

        // Simpler: Just rely on the particle system's default behavior?
        // Let's assume we have no assets. create a serialized texture?
        // Or just use a simple mesh-based explosion (Temporary)

        // BETTER: Particle System with embedded base64 texture? Expensive.
        // Let's do Mesh Explosion (Debris)

        // 1. Flash
        var flash = BABYLON.MeshBuilder.CreateSphere("flash", { diameter: 8 }, this.scene);
        flash.position = position.clone();
        var mat = new BABYLON.StandardMaterial("flashMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(1, 1, 0); // Yellow
        mat.disableLighting = true;
        mat.alpha = 1.0;
        flash.material = mat;

        // Animate Flash
        this.scene.registerBeforeRender(() => {
            if (flash.isDisposed()) return;
            flash.scaling.scaleInPlace(1.1);
            mat.alpha -= 0.1;
            if (mat.alpha <= 0) flash.dispose();
        });

        // 2. Debris (Cubes)
        for (var d = 0; d < 8; d++) {
            var deb = BABYLON.MeshBuilder.CreateBox("deb", { size: 1 }, this.scene);
            deb.position = position.clone();
            deb.material = this.ship.engineMat; // Reuse blue material? Or create red.

            var dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().scale(1.0);

            // Animate Debris
            // Attach a simple update loop to the mesh itself?
            // Safer to just push to a volatile list?
            // Using a closure here for simplicity (low object count)
            let debris = deb;
            let direction = dir;
            let life = 60;

            let rotation = new BABYLON.Vector3(Math.random(), Math.random(), Math.random());

            let observer = this.scene.onBeforeRenderObservable.add(() => {
                debris.position.addInPlace(direction);
                debris.rotation.addInPlace(rotation);
                life--;
                if (life <= 0) {
                    debris.dispose();
                    this.scene.onBeforeRenderObservable.remove(observer);
                }
            });
        }
    },

    changeShip: function (shipType, hardpointCount) {
        if (this.ship) {
            this.ship.dispose();
            this.ship = null;
        }
        // Re-create with new type
        this.inputMap = {};

        // Store Stats
        this.hardpointCount = hardpointCount || 2; // Default 2

        this.createPlayerShip(shipType);

        // Relink Camera
        if (this.camera) {
            this.camera.lockedTarget = this.ship;
        }
        console.log("Ship Changed: " + shipType + " [HP:" + this.hardpointCount + "]");
    },

    createPlayerShip: function (shipType) {
        shipType = shipType || "Terran Shuttle";

        // Root Node (The actual physics center)
        this.ship = new BABYLON.TransformNode("PlayerShip", this.scene);
        this.ship.position = new BABYLON.Vector3(0, 0, -200); // [FIX] Spawn safely away from Sun/Gates

        // Body (Cylinder)
        var body = BABYLON.MeshBuilder.CreateCylinder("body", { height: 4, diameterTop: 0, diameterBottom: 1.5, tessellation: 8 }, this.scene);
        body.rotation.x = Math.PI / 2; // Point forward
        body.parent = this.ship;
        var hullMat = new BABYLON.StandardMaterial("hullMat", this.scene);

        // Visual Variation
        if (shipType === "Mining Barge") {
            hullMat.diffuseColor = new BABYLON.Color3(1.0, 0.8, 0.2); // Yellow
            body.scaling = new BABYLON.Vector3(2, 1, 2); // Fat
        } else if (shipType === "Interceptor") {
            hullMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1); // Red
            body.scaling = new BABYLON.Vector3(0.8, 1, 0.8); // Sleek
        } else {
            hullMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.8); // Silver (Default)
        }

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

        var speed = 100;
        // Turbo (Shift + W)
        if (this.inputMap["shift"] && this.inputMap["w"]) {
            speed = 200; // Turbo
        }
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

        // Audio Engine
        var speedRatio = isThrusting ? (speed / 200) : 0;
        this.sfx.updateEngine(speedRatio);
    },

    resetShip: function () {
        if (this.ship) {
            this.ship.position = new BABYLON.Vector3(0, 0, -200); // safe entry point
            this.ship.rotation = BABYLON.Vector3.Zero();
            this.ship.rotationQuaternion = null;
        }
    },

};
