import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let physicsWorld;
let rigidBodies = [];
let playerBody;
let moveDirection = { left: 0, right: 0, forward: 0, backward: 0 };
let camera, scene, renderer, controls;
let tmpTrans;
let playerVelocity = new THREE.Vector3();
let spacePressed = false;

// Physics & player constants
const PLAYER_MASS = 1;
const PLAYER_HEIGHT = 2;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 10.0;
const JUMP_FORCE = 7;
const MAX_SLOPE_ANGLE = 45;
const STEP_HEIGHT = 0.5;
const ACCELERATION_FACTOR = 0.15;  // Lower = more gradual, Higher = more responsive
const DECELERATION_FACTOR = 0.1;   // Lower = more sliding, Higher = quicker stop
const MAX_VELOCITY = 20.0;         // Maximum speed cap
const MAX_JUMPS = 1;
let canJump = false;

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
    
    // Scene setup
    scene = new THREE.Scene();
    
    // Create large skybox sphere
    const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
    
    // Create gradient texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 2;
    canvas.height = 512;
    
    // Create gradient
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    
    // day
    gradient.addColorStop(0, '#1e90ff');   // Light blue at top
    gradient.addColorStop(0.5, '#87ceeb');  // Sky blue in middle
    gradient.addColorStop(1, '#b0e2ff');    // Lighter blue at bottom
    

    /* // sunset
    gradient.addColorStop(0, '#ff7f50');   // Coral
    gradient.addColorStop(0.5, '#ff6b6b'); // Pinkish
    gradient.addColorStop(1, '#4fb4ff');
    */

    /* // dawn
    gradient.addColorStop(0, '#4169e1');   // Royal blue
    gradient.addColorStop(0.5, '#87ceeb'); // Sky blue
    gradient.addColorStop(1, '#ffd700');   // Gold
    */
    
    // Fill canvas with gradient
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 512);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    // Create material with gradient texture
    const skyMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide, // Render on inside of sphere
    });
    
    // Create and add skybox to scene
    const skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skybox);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
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
        const cube = createRandomCube();
        scene.add(cube);
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
    
    // Completely disable rotation on all axes
    playerBody.setAngularFactor(new window.ammo.btVector3(0, 0, 0));
    
    playerBody.setFriction(0.5);
    playerBody.setRestitution(0);
    playerBody.setActivationState(4);
    playerBody.setCollisionFlags(0);

    physicsWorld.addRigidBody(playerBody);
}

function onKeyDown(event) {
    switch(event.code) {
        case 'KeyW': moveDirection.forward = 1; break;
        case 'KeyS': moveDirection.backward = 1; break;
        case 'KeyA': moveDirection.left = 1; break;
        case 'KeyD': moveDirection.right = 1; break;
        case 'Space': 
            if (!spacePressed) {
                spacePressed = true;
                jump();
            }
            break;
    }
}

function onKeyUp(event) {
    switch(event.code) {
        case 'KeyW': moveDirection.forward = 0; break;
        case 'KeyS': moveDirection.backward = 0; break;
        case 'KeyA': moveDirection.left = 0; break;
        case 'KeyD': moveDirection.right = 0; break;
        case 'Space': spacePressed = false; break;
    }
}

function jump() {
    if (!canJump) return; // Only jump if we can
    
    let velocity = playerBody.getLinearVelocity();
    velocity.setY(JUMP_FORCE);
    playerBody.setLinearVelocity(velocity);
    canJump = false; // Prevent jumping again until we hit the ground
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

    // Get current velocity
    let velocity = playerBody.getLinearVelocity();
    let currentVelocity = new THREE.Vector3(velocity.x(), velocity.y(), velocity.z());

    // Calculate target velocity based on input
    let targetVelocity = new THREE.Vector3();
    
    // Combine movement inputs
    let moveX = moveDirection.right - moveDirection.left;
    let moveZ = moveDirection.forward - moveDirection.backward;

    // Normalize diagonal movement
    if (moveX !== 0 && moveZ !== 0) {
        // Moving diagonally
        let normalizedMove = new THREE.Vector2(moveX, moveZ).normalize();
        moveX = normalizedMove.x;
        moveZ = normalizedMove.y;
    }

    // Apply normalized movement
    if (moveZ !== 0) {
        targetVelocity.add(direction.multiplyScalar(moveZ * PLAYER_SPEED));
    }
    if (moveX !== 0) {
        targetVelocity.add(rightDirection.multiplyScalar(moveX * PLAYER_SPEED));
    }

    // Interpolate between current and target velocity
    let factor = moveDirection.forward || moveDirection.backward || 
                 moveDirection.left || moveDirection.right ? 
                 ACCELERATION_FACTOR : DECELERATION_FACTOR;

    let newVelocity = new THREE.Vector3(
        lerp(currentVelocity.x, targetVelocity.x, factor),
        velocity.y(), // Keep vertical velocity unchanged
        lerp(currentVelocity.z, targetVelocity.z, factor)
    );

    // Apply speed cap
    if (newVelocity.length() > MAX_VELOCITY) {
        newVelocity.normalize().multiplyScalar(MAX_VELOCITY);
    }

    // Apply the new velocity
    playerBody.setLinearVelocity(
        new window.ammo.btVector3(newVelocity.x, velocity.y(), newVelocity.z)
    );
}

function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

function updatePhysics(deltaTime) {
    // Check for ground contact before physics step
    let from = playerBody.getWorldTransform().getOrigin();
    let to = new window.ammo.btVector3(from.x(), from.y() - (PLAYER_HEIGHT/2 + 0.1), from.z());
    
    let rayCallback = new window.ammo.ClosestRayResultCallback(from, to);
    physicsWorld.rayTest(from, to, rayCallback);
    
    canJump = rayCallback.hasHit();
    
    window.ammo.destroy(to);
    window.ammo.destroy(rayCallback);
    
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

function createRandomCube() {
    // Random base size between 0.5 and 2
    const baseSize = Math.random() * 2 + 0.5;
    
    // Create geometry as perfect cube
    const geometry = new THREE.BoxGeometry(
        baseSize,    // width
        baseSize,    // height
        baseSize     // depth
    );
    
    // Random color
    const material = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.7,
        metalness: 0.3
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;

    // Adjust spawn height based on cube size
    const spawnHeight = baseSize + 2;
    const position = new THREE.Vector3(
        (Math.random() - 0.5) * 20,  // x
        spawnHeight,                  // y
        (Math.random() - 0.5) * 20   // z
    );
    
    // Create physics body with mass based on volume
    const quat = new THREE.Quaternion();
    const mass = baseSize * baseSize * baseSize; // Cubic mass
    const body = createRigidBody(cube, mass, position, quat);

    return cube;
}