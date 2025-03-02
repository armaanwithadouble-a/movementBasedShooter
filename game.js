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

// Add these with other global variables
let weaponInventory = [];
let currentWeapon = null;
let gunMesh = null;
let weaponAttachPoint;

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
    
    createWeaponAttachPoint();

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

    createPodium();
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
        case 'KeyA': moveDirection.left = 1; break;  // This should make you move left
        case 'KeyD': moveDirection.right = 1; break; // This should make you move right
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
        case 'KeyA': moveDirection.left = 0; break;  // This should stop left movement
        case 'KeyD': moveDirection.right = 0; break; // This should stop right movement
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

    // Update weapon attach point position
    if (weaponAttachPoint) {
        const direction = new THREE.Vector3();
        controls.getDirection(direction);
        
        // Get right vector for proper positioning
        const rightVector = new THREE.Vector3();
        rightVector.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
        
        // Get up vector based on camera view
        const upVector = new THREE.Vector3();
        upVector.crossVectors(rightVector, direction).normalize();
        
        // Position attach point relative to camera view
        weaponAttachPoint.position.set(
            position.x(),
            position.y(),
            position.z()
        ).add(
            direction.multiplyScalar(0.5)  // Forward offset
        ).add(
            rightVector.multiplyScalar(0.4) // Right offset - increased from 0.3 to 0.4
        ).add(
            upVector.multiplyScalar(-0.2)   // Down offset using camera's up vector
        );
        
        // Make attach point face the same direction as camera
        weaponAttachPoint.quaternion.copy(camera.quaternion);

        // Update gun position to match attach point if we have one
        if (gunMesh && weaponInventory.length > 0) {
            // Position gun at the attach point
            gunMesh.position.copy(weaponAttachPoint.position);
            
            // Copy the attach point's orientation
            gunMesh.quaternion.copy(weaponAttachPoint.quaternion);
            
            // Rotate gun so barrel points forward relative to the attach point
            gunMesh.rotateY(Math.PI / 2);
        }
    }

    // Add weapon pickup check
    checkWeaponPickup();
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
    
    // Apply movement forces to player
    let moveX = moveDirection.left - moveDirection.right;
    let moveZ = moveDirection.backward - moveDirection.forward;
    
    if (moveX !== 0 || moveZ !== 0) {
        // Get current velocity
        let velocity = playerBody.getLinearVelocity();
        
        // Get camera direction
        let direction = new THREE.Vector3();
        controls.getDirection(direction);
        direction.y = 0; // Keep movement on XZ plane
        direction.normalize();
        
        // Get right vector
        let right = new THREE.Vector3();
        right.crossVectors(new THREE.Vector3(0, 1, 0), direction);
        
        // Calculate target velocity based on input
        let targetVelocity = new THREE.Vector3();
        targetVelocity.add(direction.multiplyScalar(-moveZ * PLAYER_SPEED));
        targetVelocity.add(right.multiplyScalar(moveX * PLAYER_SPEED));
        
        // Normalize diagonal movement
        if (moveX !== 0 && moveZ !== 0) {
            // If moving diagonally, normalize the vector to prevent faster diagonal movement
            targetVelocity.normalize().multiplyScalar(PLAYER_SPEED);
        }
        
        // Apply acceleration to current velocity
        playerVelocity.x = lerp(velocity.x(), targetVelocity.x, ACCELERATION_FACTOR);
        playerVelocity.z = lerp(velocity.z(), targetVelocity.z, ACCELERATION_FACTOR);
        
        // Limit maximum velocity
        const currentSpeed = Math.sqrt(playerVelocity.x * playerVelocity.x + playerVelocity.z * playerVelocity.z);
        if (currentSpeed > MAX_VELOCITY) {
            const scaleFactor = MAX_VELOCITY / currentSpeed;
            playerVelocity.x *= scaleFactor;
            playerVelocity.z *= scaleFactor;
        }
        
        // Set the new velocity
        velocity.setX(playerVelocity.x);
        velocity.setZ(playerVelocity.z);
        playerBody.setLinearVelocity(velocity);
    } else {
        // Decelerate when no input
        let velocity = playerBody.getLinearVelocity();
        playerVelocity.x = lerp(velocity.x(), 0, DECELERATION_FACTOR);
        playerVelocity.z = lerp(velocity.z(), 0, DECELERATION_FACTOR);
        velocity.setX(playerVelocity.x);
        velocity.setZ(playerVelocity.z);
        playerBody.setLinearVelocity(velocity);
    }
    
    physicsWorld.stepSimulation(deltaTime, 10);

    // Rest of the function remains the same
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

function createGunMesh() {
    const gunGroup = new THREE.Group();

    // Gun body - positioned above the origin (which will be at the handle)
    const bodyGeometry = new THREE.BoxGeometry(0.25, 0.15, 0.1);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.2;  // Move body up from origin
    
    // Gun barrel - positioned at the front of the body
    const barrelGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0.25, 0.2, 0); // Position at right side of body, same height as body
    barrel.rotation.z = Math.PI / 2;  // Rotate to point along X axis
    
    // Gun handle - centered at origin (0,0,0)
    const handleGeometry = new THREE.BoxGeometry(0.08, 0.25, 0.1);
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    // Handle is at origin, so no position adjustment needed
    
    // Add parts to group
    gunGroup.add(body);
    gunGroup.add(barrel);
    gunGroup.add(handle);

    return gunGroup;
}

function createPodium() {
    // Create podium
    const podiumGeometry = new THREE.BoxGeometry(1, 1, 1);
    const podiumMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x808080,
        metalness: 0.5,
        roughness: 0.5
    });
    const podium = new THREE.Mesh(podiumGeometry, podiumMaterial);
    podium.position.set(15, 0.5, 15); // Moved further from center
    podium.receiveShadow = true;
    podium.castShadow = true;
    scene.add(podium);

    // Add physics to podium
    const podiumPos = new THREE.Vector3(15, 0.5, 15);
    const podiumQuat = new THREE.Quaternion(0, 0, 0, 1);
    createRigidBody(podium, 0, podiumPos, podiumQuat); // Mass of 0 makes it static

    // Create gun and place it on podium
    gunMesh = createGunMesh();
    gunMesh.position.set(15, 1.5, 15); // Match podium's new position
    gunMesh.scale.set(1, 1, 1);
    // Rotate gun on podium to display it nicely
    gunMesh.rotation.y = Math.PI / 4; // Rotate 45 degrees for better visibility
    gunMesh.userData.isWeapon = true;
    gunMesh.userData.weaponType = 'Pistol';
    scene.add(gunMesh);

    // Create weapon label
    createWeaponLabel();
}

function createWeaponLabel() {
    const labelDiv = document.createElement('div');
    labelDiv.id = 'weaponLabel';
    labelDiv.style.position = 'fixed';
    labelDiv.style.bottom = '20px';
    labelDiv.style.right = '20px';
    labelDiv.style.padding = '10px';
    labelDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    labelDiv.style.color = 'white';
    labelDiv.style.fontFamily = 'Arial, sans-serif';
    labelDiv.style.fontSize = '20px';
    labelDiv.style.userSelect = 'none';
    document.body.appendChild(labelDiv);
    updateWeaponLabel();
}

function updateWeaponLabel() {
    const label = document.getElementById('weaponLabel');
    if (label) {
        label.textContent = currentWeapon || 'No Weapon';
    }
}

function checkWeaponPickup() {
    if (!gunMesh) return;
    
    const playerPos = new THREE.Vector3(
        playerBody.getWorldTransform().getOrigin().x(),
        playerBody.getWorldTransform().getOrigin().y(),
        playerBody.getWorldTransform().getOrigin().z()
    );
    
    const distance = playerPos.distanceTo(gunMesh.position);
    
    if (distance < 1.5 && !weaponInventory.includes(gunMesh.userData.weaponType)) {
        console.log("Weapon picked up!");
        weaponInventory.push(gunMesh.userData.weaponType);
        currentWeapon = gunMesh.userData.weaponType;
        
        // Remove gun from podium
        scene.remove(gunMesh);
        
        // Create new gun model attached to player
        const playerGun = createGunMesh();
        playerGun.scale.set(0.8, 0.8, 0.8);  // Slightly reduced overall scale
        scene.add(playerGun);
        
        // Important: Transfer the weapon data to the new gun mesh
        playerGun.userData = gunMesh.userData;
        gunMesh = playerGun;

        // Update the weapon label
        updateWeaponLabel();
    }
}

function createWeaponAttachPoint() {
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.7
    });
    weaponAttachPoint = new THREE.Mesh(geometry, material);
    
    // Make it visible but non-collidable
    weaponAttachPoint.visible = true;  // Make it visible again
    weaponAttachPoint.userData.noCollision = true;
    
    // Don't add it to the physics world
    scene.add(weaponAttachPoint);
    
    console.log("Weapon attach point created:", weaponAttachPoint);
}