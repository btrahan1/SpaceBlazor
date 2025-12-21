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

        // Skybox (Starfield)
        var skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, this.scene);
        var skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("https://playground.babylonjs.com/textures/Space/space", this.scene);
        skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skybox.material = skyboxMaterial;

        // Create Player Ship
        this.createPlayerShip();

        // Camera (Follow Ship)
        // Parameters: Name, Position, Scene
        this.camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), this.scene);
        this.camera.radius = 15; // How far from the object to follow
        this.camera.heightOffset = 5; // How high above the object to place the camera
        this.camera.rotationOffset = 180; // The viewing angle
        this.camera.cameraAcceleration = 0.05; // How fast to move
        this.camera.maxCameraSpeed = 20; // Speed limit
        this.camera.lockedTarget = this.ship; // Target the ship

        this.camera.attachControl(this.canvas, true);

        // Input Handling
        this.inputMap = {};
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type == "keydown";
        }));
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type == "keydown";
        }));

        // Render Loop
        this.engine.runRenderLoop(() => {
            this.updateShip();
            this.scene.render();
        });

        // Resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        this.canvas.focus();
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

        var speed = 0.2;
        var turnSpeed = 0.05;

        // Movement Logic
        if (this.inputMap["w"]) {
            this.ship.position.addInPlace(this.ship.forward.scale(speed));
        }
        if (this.inputMap["s"]) {
            this.ship.position.addInPlace(this.ship.forward.scale(-speed * 0.5));
        }
        if (this.inputMap["a"]) {
            this.ship.rotation.y -= turnSpeed;
            this.ship.rotation.z = BABYLON.Scalar.Lerp(this.ship.rotation.z, 0.5, 0.1); // Roll left
        } else if (this.inputMap["d"]) {
            this.ship.rotation.y += turnSpeed;
            this.ship.rotation.z = BABYLON.Scalar.Lerp(this.ship.rotation.z, -0.5, 0.1); // Roll right
        } else {
            // Level out
            this.ship.rotation.z = BABYLON.Scalar.Lerp(this.ship.rotation.z, 0, 0.1);
        }
    }
};
