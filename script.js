import {
    HandLandmarker,
    FilesetResolver
} from "@mediapipe/tasks-vision";

const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gestureText = document.getElementById("gesture");
const fingerText = document.getElementById("fingerCount");
const loading = document.getElementById("loading");
const switchButton = document.getElementById("switchCamera");

let handLandmarker;
let currentStream;
let facingMode = "user";

let currentGesture = "NONE";
let targetGesture = "NONE";

let gestureCandidate = "NONE";
let candidateFrames = 0;

let particles = [];
let trails = [];

let objectX = 0;
let objectY = 0;

let targetX = 0;
let targetY = 0;

let rotation = 0;
let energy = 0;

let lastVideoTime = -1;


// ======================================================
// CONFIG
// ======================================================

const CONFIG = {

    // Gesture harus terbaca beberapa frame
    // sebelum dianggap valid.
    gestureConfirmFrames: 8,

    // Seberapa cepat objek mengikuti tangan.
    positionSmoothing: 0.16,

    // Seberapa cepat rotasi berubah.
    rotationSpeed: 0.025,

    // Jumlah particle ketika shape pecah.
    burstParticles: 90,

    // Particle chaos.
    chaosParticles: 12
};


// ======================================================
// MEDIAPIPE
// ======================================================

async function setupHandTracking() {

    const vision =
        await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );

    handLandmarker =
        await HandLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {

                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",

                    delegate: "GPU"
                },

                runningMode: "VIDEO",

                numHands: 1,

                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            }
        );

    loading.style.display = "none";

    await startCamera();
}


// ======================================================
// CAMERA
// ======================================================

async function startCamera() {

    if (currentStream) {

        currentStream
            .getTracks()
            .forEach(track => track.stop());
    }

    currentStream =
        await navigator.mediaDevices.getUserMedia({

            video: {

                facingMode,

                width: {
                    ideal: 1280
                },

                height: {
                    ideal: 720
                }
            },

            audio: false
        });

    video.srcObject = currentStream;

    await video.play();

    resizeCanvas();

    requestAnimationFrame(detect);
}


// ======================================================
// RESIZE
// ======================================================

function resizeCanvas() {

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (!objectX) {

        objectX =
            canvas.width / 2;

        objectY =
            canvas.height / 2;

        targetX = objectX;
        targetY = objectY;
    }
}

window.addEventListener(
    "resize",
    resizeCanvas
);


// ======================================================
// FINGER COUNT
// ======================================================

function countFingers(hand) {

    let count = 0;

    // Thumb
    if (hand[4].x < hand[3].x) {
        count++;
    }

    // Index
    if (hand[8].y < hand[6].y) {
        count++;
    }

    // Middle
    if (hand[12].y < hand[10].y) {
        count++;
    }

    // Ring
    if (hand[16].y < hand[14].y) {
        count++;
    }

    // Pinky
    if (hand[20].y < hand[18].y) {
        count++;
    }

    return count;
}


// ======================================================
// GESTURE MAP
// ======================================================

function detectGesture(fingers) {

    if (fingers === 0)
        return "CIRCLE";

    if (fingers === 1)
        return "HEART";

    if (fingers === 2)
        return "CUBE";

    if (fingers === 3)
        return "TRIANGLE";

    if (fingers === 5)
        return "CHAOS";

    return "UNKNOWN";
}


// ======================================================
// GESTURE SMOOTHING
// ======================================================

function smoothGesture(newGesture) {

    if (newGesture === "UNKNOWN") {
        return;
    }

    if (newGesture === gestureCandidate) {

        candidateFrames++;

    } else {

        gestureCandidate = newGesture;
        candidateFrames = 1;
    }


    if (
        candidateFrames >=
        CONFIG.gestureConfirmFrames
    ) {

        if (
            currentGesture !==
            gestureCandidate
        ) {

            changeGesture(
                gestureCandidate
            );
        }
    }
}


// ======================================================
// GESTURE CHANGE
// ======================================================

function changeGesture(newGesture) {

    if (
        currentGesture ===
        newGesture
    ) {
        return;
    }


    // Pecahkan objek sebelumnya
    if (
        currentGesture !== "NONE" &&
        currentGesture !== "CHAOS"
    ) {

        explodeObject();
    }


    currentGesture = newGesture;

    gestureText.textContent =
        newGesture;


    // Energy burst
    energy = 1;


    // Spawn particle menuju bentuk baru
    if (
        newGesture !== "CHAOS"
    ) {

        spawnTransitionParticles();
    }
}


// ======================================================
// PARTICLE CLASS
// ======================================================

class Particle {

    constructor(
        x,
        y,
        targetX,
        targetY,
        explosive = false
    ) {

        this.x = x;
        this.y = y;

        this.startX = x;
        this.startY = y;

        this.targetX = targetX;
        this.targetY = targetY;

        this.vx =
            (Math.random() - 0.5) *
            (explosive ? 18 : 4);

        this.vy =
            (Math.random() - 0.5) *
            (explosive ? 18 : 4);

        this.life = 1;

        this.decay =
            explosive
                ? 0.012 + Math.random() * 0.018
                : 0.006 + Math.random() * 0.008;

        this.size =
            Math.random() * 4 + 1;

        this.phase =
            Math.random() *
            Math.PI * 2;
    }


    update() {

        this.phase += 0.08;


        if (
            this.targetX !== null &&
            this.targetY !== null
        ) {

            const dx =
                this.targetX -
                this.x;

            const dy =
                this.targetY -
                this.y;


            this.vx += dx * 0.015;
            this.vy += dy * 0.015;
        }


        this.vx *= 0.96;
        this.vy *= 0.96;


        this.x += this.vx;
        this.y += this.vy;


        this.life -= this.decay;
    }


    draw() {

        ctx.save();

        ctx.globalAlpha =
            Math.max(0, this.life);

        ctx.shadowBlur = 15;

        ctx.shadowColor =
            "rgba(255,255,255,0.9)";

        ctx.fillStyle = "white";


        ctx.beginPath();

        ctx.arc(
            this.x,
            this.y,
            this.size,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.restore();
    }
}


// ======================================================
// EXPLOSION
// ======================================================

function explodeObject() {

    const count =
        CONFIG.burstParticles;


    for (let i = 0; i < count; i++) {

        const angle =
            Math.random() *
            Math.PI * 2;

        const radius =
            Math.random() * 100;


        const x =
            objectX +
            Math.cos(angle) *
            radius;

        const y =
            objectY +
            Math.sin(angle) *
            radius;


        particles.push(

            new Particle(
                x,
                y,
                null,
                null,
                true
            )

        );
    }
}


// ======================================================
// TRANSITION PARTICLES
// ======================================================

function spawnTransitionParticles() {

    for (
        let i = 0;
        i < 45;
        i++
    ) {

        const angle =
            Math.random() *
            Math.PI * 2;

        const radius =
            Math.random() * 120;


        const startX =
            objectX +
            Math.cos(angle) *
            radius;

        const startY =
            objectY +
            Math.sin(angle) *
            radius;


        const targetX =
            objectX +
            (Math.random() - 0.5) *
            220;

        const targetY =
            objectY +
            (Math.random() - 0.5) *
            220;


        particles.push(

            new Particle(
                startX,
                startY,
                targetX,
                targetY
            )

        );
    }
}


// ======================================================
// CHAOS
// ======================================================

function spawnChaos() {

    for (
        let i = 0;
        i < CONFIG.chaosParticles;
        i++
    ) {

        particles.push(

            new Particle(
                objectX,
                objectY,
                null,
                null,
                true
            )

        );
    }
}


// ======================================================
// ENERGY RING
// ======================================================

function drawEnergyRing() {

    if (energy <= 0)
        return;


    ctx.save();

    ctx.globalAlpha =
        energy;

    ctx.strokeStyle =
        "rgba(255,255,255,0.9)";

    ctx.lineWidth = 3;

    ctx.shadowBlur = 30;

    ctx.shadowColor =
        "white";


    ctx.beginPath();

    ctx.arc(
        objectX,
        objectY,
        80 + (1 - energy) * 100,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.restore();


    energy -= 0.025;
}


// ======================================================
// TRAIL
// ======================================================

function updateTrail() {

    trails.push({

        x: objectX,

        y: objectY,

        life: 1
    });


    if (trails.length > 15) {
        trails.shift();
    }


    trails.forEach(
        (trail, index) => {

            trail.life -= 0.07;


            ctx.save();

            ctx.globalAlpha =
                Math.max(
                    0,
                    trail.life * 0.18
                );

            ctx.fillStyle =
                "white";


            ctx.beginPath();

            ctx.arc(
                trail.x,
                trail.y,
                5 + index * 0.4,
                0,
                Math.PI * 2
            );

            ctx.fill();

            ctx.restore();
        }
    );
}


// ======================================================
// SHAPES
// ======================================================

function drawCircle() {

    ctx.save();

    ctx.translate(
        objectX,
        objectY
    );

    ctx.rotate(rotation);

    ctx.strokeStyle =
        "white";

    ctx.lineWidth = 5;

    ctx.shadowBlur = 30;

    ctx.shadowColor =
        "white";


    ctx.beginPath();

    ctx.arc(
        0,
        0,
        75,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.restore();
}


function drawTriangle() {

    ctx.save();

    ctx.translate(
        objectX,
        objectY
    );

    ctx.rotate(rotation);


    ctx.strokeStyle =
        "white";

    ctx.lineWidth = 5;

    ctx.shadowBlur = 25;

    ctx.shadowColor =
        "white";


    const size = 95;


    ctx.beginPath();

    for (
        let i = 0;
        i < 3;
        i++
    ) {

        const angle =
            -Math.PI / 2 +
            i * Math.PI * 2 / 3;


        const x =
            Math.cos(angle) *
            size;

        const y =
            Math.sin(angle) *
            size;


        if (i === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }

    ctx.closePath();

    ctx.stroke();

    ctx.restore();
}


function drawHeart() {

    ctx.save();

    ctx.translate(
        objectX,
        objectY
    );

    ctx.rotate(
        Math.sin(rotation) * 0.08
    );


    ctx.strokeStyle =
        "white";

    ctx.lineWidth = 5;

    ctx.shadowBlur = 30;

    ctx.shadowColor =
        "white";


    ctx.beginPath();

    ctx.moveTo(
        0,
        75
    );

    ctx.bezierCurveTo(
        -120,
        0,
        -90,
        -100,
        0,
        -45
    );

    ctx.bezierCurveTo(
        90,
        -100,
        120,
        0,
        0,
        75
    );

    ctx.stroke();

    ctx.restore();
}


function drawCube() {

    ctx.save();

    ctx.translate(
        objectX,
        objectY
    );

    ctx.rotate(rotation);


    const size = 70;
    const offset = 35;


    ctx.strokeStyle =
        "white";

    ctx.lineWidth = 4;

    ctx.shadowBlur = 25;

    ctx.shadowColor =
        "white";


    ctx.strokeRect(
        -size,
        -size,
        size * 2,
        size * 2
    );


    ctx.strokeRect(
        -size + offset,
        -size - offset,
        size * 2,
        size * 2
    );


    const corners = [

        [-size, -size],
        [size, -size],
        [-size, size],
        [size, size]

    ];


    corners.forEach(
        ([x, y]) => {

            ctx.beginPath();

            ctx.moveTo(x, y);

            ctx.lineTo(
                x + offset,
                y - offset
            );

            ctx.stroke();
        }
    );


    ctx.restore();
}


// ======================================================
// DRAW CURRENT OBJECT
// ======================================================

function drawCurrentShape() {

    switch (currentGesture) {

        case "CIRCLE":
            drawCircle();
            break;

        case "HEART":
            drawHeart();
            break;

        case "CUBE":
            drawCube();
            break;

        case "TRIANGLE":
            drawTriangle();
            break;

        case "CHAOS":
            spawnChaos();
            break;
    }
}


// ======================================================
// PARTICLE UPDATE
// ======================================================

function updateParticles() {

    particles =
        particles.filter(
            particle => {

                particle.update();

                particle.draw();

                return particle.life > 0;
            }
        );
}


// ======================================================
// MAIN DETECTION
// ======================================================

async function detect() {

    if (
        !handLandmarker ||
        video.readyState < 2
    ) {

        requestAnimationFrame(
            detect
        );

        return;
    }


    if (
        video.currentTime !==
        lastVideoTime
    ) {

        lastVideoTime =
            video.currentTime;


        const results =
            handLandmarker.detectForVideo(
                video,
                performance.now()
            );


        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        if (
            results.landmarks &&
            results.landmarks.length
        ) {

            const hand =
                results.landmarks[0];


            const fingers =
                countFingers(hand);


            const gesture =
                detectGesture(fingers);


            fingerText.textContent =
                `${fingers} fingers`;


            smoothGesture(
                gesture
            );


            // Palm center
            const wrist =
                hand[0];

            const middle =
                hand[9];


            const handX =
                (1 -
                    (wrist.x +
                    middle.x) / 2)
                * canvas.width;


            const handY =
                ((wrist.y +
                middle.y) / 2)
                * canvas.height;


            targetX = handX;
            targetY = handY;
        }


        // Smooth position
        objectX +=
            (targetX - objectX) *
            CONFIG.positionSmoothing;


        objectY +=
            (targetY - objectY) *
            CONFIG.positionSmoothing;


        rotation +=
            CONFIG.rotationSpeed;


        updateTrail();

        drawEnergyRing();

        drawCurrentShape();

        updateParticles();
    }


    requestAnimationFrame(
        detect
    );
}


// ======================================================
// CAMERA SWITCH
// ======================================================

switchButton.addEventListener(
    "click",
    async () => {

        facingMode =
            facingMode === "user"
                ? "environment"
                : "user";


        await startCamera();
    }
);


// ======================================================
// START
// ======================================================

setupHandTracking()
    .catch(error => {

        console.error(error);

        loading.innerHTML = `
            <p>
                Hand tracking gagal dimuat.
            </p>
        `;
    });