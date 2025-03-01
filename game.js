import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let physicsWorld;
let rigidBodies = [];
let playerBody;
let moveDirection = { left: 0, right: 0, forward: 0, backward: 0 };
let camera, scene, renderer, controls;
let tmpTrans;
let playerVelocity = new THREE.Vector3();

// Physics & player constants
const PLAYER_MASS = 1;
const PLAYER_HEIGHT = 2;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 10.0;
const JUMP_FORCE = 5;
const MAX_SLOPE_ANGLE = 45;
const STEP_HEIGHT = 0.5;

// Wait for Ammo.js to be ready
window.addEventListener('load', () => {
    console.log("Page loaded, waiting for Ammo.js...");
    
    // Make sure Ammo is loaded
    if (typeof Ammo === 'function') {
        Ammo().then(function(AmmoLib) {
            console.log("Ammo.js initialized successfully");
            window.ammo = AmmoLib; // Store Ammo instance globally
            init();
            animate();
        }).catch(function(error) {
            console.error("Error initializing Ammo.js:", error);
        });
    } else {
        console.error("Ammo.js not found");
    }
});

function initPhysics() {
    // Create physics world
    let collisionConfiguration = new window.ammo.btDefaultCollisionConfiguration();
    let dispatcher = new window.ammo.btCollisionDispatcher(collisionConfiguration);
    let overlappingPairCache = new window.ammo.btDbvtBroadphase();
    let solver = new window.ammo.btSequentialImpulseConstraintSolver();
    
    physicsWorld = new window.ammo.btDiscreteDynamicsWorld(
        dispatcher, overlappingPairCache, solver, collisionConfiguration
    );
    physicsWorld.setGravity(new window.ammo.btVector3(0, -9.81, 0));
    
    tmpTrans = new window.ammo.btTransform();
}

function createRigidBody(mesh, mass, pos, quat) {
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);

    let transform = new window.ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new window.ammo.btVector3(pos.x, pos.y, pos.z));
    transform.setRotation(new window.ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));

    let motionState = new window.ammo.btDefaultMotionState(transform);
    let shape;

    if (mesh.geometry instanceof THREE.BoxGeometry) {
        let dimensions = mesh.geometry.parameters;
        shape = new window.ammo.btBoxShape(new window.ammo.btVector3(
            dimensions.width * 0.5,
            dimensions.height * 0.5,
            dimensions.depth * 0.5
        ));
    } else if (mesh.geometry instanceof THREE.PlaneGeometry) {
        shape = new window.ammo.btBoxShape(new window.ammo.btVector3(50, 0.1, 50));
    }

    shape.setMargin(0.05);

    let localInertia = new window.ammo.btVector3(0, 0, 0);
    if (mass > 0) {
        shape.calculateLocalInertia(mass, localInertia);
    }

    let rbInfo = new window.ammo.btRigidBodyConstructionInfo(
        mass, motionState, shape, localInertia
    );
    let body = new window.ammo.btRigidBody(rbInfo);

    body.setFriction(0.5);
    body.setRestitution(0.2);

    physicsWorld.addRigidBody(body);

    if (mass > 0) {
        body.setActivationState(4);
        rigidBodies.push({ mesh: mesh, body: body });
    }

    return body;
}

function init() {
    initPhysics();
    
    // Scene setup with more vibrant sky
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x4FB4FF); // Brighter blue sky
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    controls = new PointerLockControls(camera, document.body);

    // Enhanced ambient lighting setup - increased intensity
    const ambientLight = new THREE.AmbientLight(0x6666ff, 0.8); // Increased from 0.4 to 0.8
    scene.add(ambientLight);

    // Add hemisphere light with increased intensity
    const hemiLight = new THREE.HemisphereLight(
        0x80B5FF, // Sky color
        0x66FF66, // Ground color
        0.8       // Increased from 0.4 to 0.8
    );
    scene.add(hemiLight);

    // Main directional light - slightly reduced to balance with ambient
    const directionalLight = new THREE.DirectionalLight(0xFFD2A1, 1.2); // Reduced from 1.6
    directionalLight.position.set(-50, 50, -30);
    directionalLight.castShadow = true;

    // Shadow settings
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.normalBias = 0.02;
    directionalLight.shadow.radius = 1.5;
    scene.add(directionalLight);

    // Increased fill light intensities
    const fillLight1 = new THREE.DirectionalLight(0x8088ff, 0.4); // Increased from 0.2
    fillLight1.position.set(10, 2, 10);
    scene.add(fillLight1);

    const fillLight2 = new THREE.DirectionalLight(0x88ff88, 0.4); // Increased from 0.2
    fillLight2.position.set(-10, 2, -10);
    scene.add(fillLight2);

    // Add two more fill lights for better ambient coverage
    const fillLight3 = new THREE.DirectionalLight(0xffffaa, 0.3); // Warm fill light
    fillLight3.position.set(0, 5, 15);
    scene.add(fillLight3);

    const fillLight4 = new THREE.DirectionalLight(0xaaffff, 0.3); // Cool fill light
    fillLight4.position.set(0, 5, -15);
    scene.add(fillLight4);

    // Create ground
    const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x44FF44,
        roughness: 0.8,
        metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create physics for ground
    const groundPos = new THREE.Vector3(0, -0.5, 0);
    const groundQuat = new THREE.Quaternion(0, 0, 0, 1);
    createRigidBody(ground, 0, groundPos, groundQuat);

    // Add random cubes with more vibrant materials
    const arcadeColors = [
        0xFF4444, // Red
        0x44FF44, // Green
        0x4444FF, // Blue
        0xFFFF44, // Yellow
        0xFF44FF, // Magenta
        0x44FFFF, // Cyan
    ];

    for (let i = 0; i < 20; i++) {
        const size = 1 + Math.random() * 2;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: arcadeColors[Math.floor(Math.random() * arcadeColors.length)],
            roughness: 0.4, // More shiny
            metalness: 0.6, // More metallic
            emissive: 0x111111, // Slight glow
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.castShadow = true;
        cube.receiveShadow = true;
        scene.add(cube);

        const position = new THREE.Vector3(
            Math.random() * 40 - 20,
            size / 2 + 2,
            Math.random() * 40 - 20
        );
        const rotation = new THREE.Quaternion();
        rotation.setFromEuler(new THREE.Euler(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        ));
        
        createRigidBody(cube, size, position, rotation);
    }

    // Create player
    createPlayer();

    // Enhanced renderer settings for better shadows
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.autoUpdate = true; // Ensure shadows update
    document.body.appendChild(renderer.domElement);

    // Modify materials to better receive shadows
    ground.material.shadowSide = THREE.FrontSide;
    ground.receiveShadow = true;

    // Update cube materials for better shadow reception
    rigidBodies.forEach(({ mesh }) => {
        mesh.material.shadowSide = THREE.FrontSide;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    });

    // Event listeners
    document.addEventListener('click', () => controls.lock());
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
}

function createPlayer() {
    let shape = new window.ammo.btCapsuleShape(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2);
    let transform = new window.ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new window.ammo.btVector3(0, PLAYER_HEIGHT, 0));

    let motionState = new window.ammo.btDefaultMotionState(transform);
    let localInertia = new window.ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(PLAYER_MASS, localInertia);

    let rbInfo = new window.ammo.btRigidBodyConstructionInfo(
        PLAYER_MASS, motionState, shape, localInertia
    );
    playerBody = new window.ammo.btRigidBody(rbInfo);
    
    playerBody.setAngularFactor(new window.ammo.btVector3(0, 1, 0));
    playerBody.setFriction(0.5);
    playerBody.setRestitution(0);
    playerBody.setActivationState(4);

    physicsWorld.addRigidBody(playerBody);
}

function onKeyDown(event) {
    switch(event.code) {
        case 'KeyW': moveDirection.forward = 1; break;
        case 'KeyS': moveDirection.backward = 1; break;
        case 'KeyA': moveDirection.left = 1; break;
        case 'KeyD': moveDirection.right = 1; break;
        case 'Space': jump(); break;
    }
}

function onKeyUp(event) {
    switch(event.code) {
        case 'KeyW': moveDirection.forward = 0; break;
        case 'KeyS': moveDirection.backward = 0; break;
        case 'KeyA': moveDirection.left = 0; break;
        case 'KeyD': moveDirection.right = 0; break;
    }
}

function jump() {
    let velocity = playerBody.getLinearVelocity();
    velocity.setY(JUMP_FORCE);
    playerBody.setLinearVelocity(velocity);
}

function updatePlayer() {
    if (!controls.isLocked) return;

    let transform = playerBody.getWorldTransform();
    let position = transform.getOrigin();
    
    camera.position.set(position.x(), position.y(), position.z());

    let direction = new THREE.Vector3();
    controls.getDirection(direction);
    let rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(direction, new THREE.Vector3(0, 1, 0));

    let moveForce = new window.ammo.btVector3(0, 0, 0);

    if (moveDirection.forward || moveDirection.backward) {
        let z = moveDirection.forward - moveDirection.backward;
        moveForce.setX(direction.x * z * PLAYER_SPEED);
        moveForce.setZ(direction.z * z * PLAYER_SPEED);
    }

    if (moveDirection.left || moveDirection.right) {
        let x = moveDirection.right - moveDirection.left;
        moveForce.setX(moveForce.x() + rightDirection.x * x * PLAYER_SPEED);
        moveForce.setZ(moveForce.z() + rightDirection.z * x * PLAYER_SPEED);
    }

    playerBody.applyCentralForce(moveForce);
}

function updatePhysics(deltaTime) {
    physicsWorld.stepSimulation(deltaTime, 10);

    for (let i = 0; i < rigidBodies.length; i++) {
        let objThree = rigidBodies[i].mesh;
        let objAmmo = rigidBodies[i].body;
        let ms = objAmmo.getMotionState();
        if (ms) {
            ms.getWorldTransform(tmpTrans);
            let p = tmpTrans.getOrigin();
            let q = tmpTrans.getRotation();
            objThree.position.set(p.x(), p.y(), p.z());
            objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = 1/60;
    updatePlayer();
    updatePhysics(deltaTime);
    
    // Force shadow map update
    renderer.shadowMap.needsUpdate = true;
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}