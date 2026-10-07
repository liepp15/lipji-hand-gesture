import {
    HandLandmarker,
    FilesetResolver
} from "@mediapipe/tasks-vision";

// ===============================
// ELEMENTS
// ===============================
const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gestureText = document.getElementById("gesture");
const fingerText = document.getElementById("fingerCount");
const loading = document.getElementById("loading");
const switchCamera = document.getElementById("switchCamera");

// ===============================
// CONFIG
// ===============================
const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker;
let stream = null;
let facingMode = "user";
let lastVideoTime = -1;

let currentGesture = "NONE";
let candidateGesture = "NONE";
let candidateFrames = 0;

const gestureConfirmFrames = 6;

// Smooth hand position
let handX = 0.5;
let handY = 0.5;

const smoothing = 0.18;

// Shape animation
let rotation = 0;
let pulse = 0;

// Particles
const particles = [];

// ===============================
// INIT MEDIAPIPE
// ===============================
async function initHandTracking() {
    try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);

        handLandmarker = await HandLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath: MODEL_URL,
                    delegate: "GPU"
                },

                runningMode: "VIDEO",
                numHands: 1,

                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            }
        );

        console.log("MediaPipe loaded successfully");

        await startCamera();

        loading.style.display = "none";

    } catch (error) {
        console.error("MediaPipe error:", error);

        loading.innerHTML = `
            <p style="color:#ff5555">
                Failed to load hand tracking.
            </p>
            <small>${error.message}</small>
        `;
    }
}

// ===============================
// CAMERA
// ===============================
async function startCamera() {

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    try {

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

        resizeCanvas();

        requestAnimationFrame(loop);

    } catch (error) {

        console.error("Camera error:", error);

        loading.innerHTML = `
            <p style="color:#ff5555">
                Camera access denied.
            </p>
        `;
    }
}

// ===============================
// CANVAS
// ===============================
function resizeCanvas() {

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);

// ===============================
// FINGER DETECTION
// ===============================
function distance(a, b) {

    return Math.sqrt(
        Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2) +
        Math.pow(a.z - b.z, 2)
    );
}

function isFingerExtended(landmarks, tip, pip) {

    return landmarks[tip].y < landmarks[pip].y;
}

function countFingers(landmarks) {

    let count = 0;

    // Index
    if (isFingerExtended(landmarks, 8, 6))
        count++;

    // Middle
    if (isFingerExtended(landmarks, 12, 10))
        count++;

    // Ring
    if (isFingerExtended(landmarks, 16, 14))
        count++;

    // Pinky
    if (isFingerExtended(landmarks, 20, 18))
        count++;

    // Thumb
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];

    if (distance(thumbTip, landmarks[5]) >
        distance(thumbIP, landmarks[5])) {

        count++;
    }

    return count;
}

// ===============================
// GESTURE
// ===============================
function getGesture(fingers) {

    switch (fingers) {

        case 0:
            return "CIRCLE";

        case 1:
            return "HEART";

        case 2:
            return "CUBE";

        case 3:
            return "TRIANGLE";

        case 5:
            return "CHAOS";

        default:
            return "NONE";
    }
}

// ===============================
// GESTURE SMOOTHING
// ===============================
function updateGesture(newGesture) {

    if (newGesture === candidateGesture) {

        candidateFrames++;

    } else {

        candidateGesture = newGesture;
        candidateFrames = 0;
    }

    if (
        candidateFrames >= gestureConfirmFrames &&
        currentGesture !== candidateGesture
    ) {

        explodeShape();

        currentGesture = candidateGesture;

        console.log("Gesture:", currentGesture);
    }
}

// ===============================
// PARTICLE
// ===============================
class Particle {

    constructor(x, y, power = 1) {

        this.x = x;
        this.y = y;

        const angle =
            Math.random() * Math.PI * 2;

        const speed =
            (Math.random() * 8 + 2) * power;

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.life = 1;

        this.size =
            Math.random() * 4 + 1;
    }

    update() {

        this.x += this.vx;
        this.y += this.vy;

        this.vx *= 0.97;
        this.vy *= 0.97;

        this.life -= 0.025;
    }

    draw() {

        ctx.globalAlpha = this.life;

        ctx.beginPath();

        ctx.arc(
            this.x,
            this.y,
            this.size,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.globalAlpha = 1;
    }
}

// ===============================
// EXPLOSION
// ===============================
function explodeShape() {

    const cx = handX * canvas.width;
    const cy = handY * canvas.height;

    for (let i = 0; i < 90; i++) {

        particles.push(
            new Particle(
                cx,
                cy,
                Math.random() * 2 + 0.5
            )
        );
    }
}

// ===============================
// UPDATE PARTICLES
// ===============================
function updateParticles() {

    for (let i = particles.length - 1; i >= 0; i--) {

        particles[i].update();

        if (particles[i].life <= 0) {

            particles.splice(i, 1);

        } else {

            particles[i].draw();
        }
    }
}

// ===============================
// SHAPES
// ===============================
function drawCircle(x, y) {

    const radius =
        100 + Math.sin(pulse) * 10;

    ctx.lineWidth = 8;

    ctx.beginPath();

    ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.stroke();
}

function drawHeart(x, y) {

    ctx.save();

    ctx.translate(x, y);

    ctx.scale(5, 5);

    ctx.beginPath();

    ctx.moveTo(0, 30);

    ctx.bezierCurveTo(
        -50, -5,
        -40, -45,
        0, -20
    );

    ctx.bezierCurveTo(
        40, -45,
        50, -5,
        0, 30
    );

    ctx.stroke();

    ctx.restore();
}

function drawTriangle(x, y) {

    const size = 120;

    ctx.save();

    ctx.translate(x, y);

    ctx.rotate(rotation);

    ctx.beginPath();

    for (let i = 0; i < 3; i++) {

        const angle =
            -Math.PI / 2 +
            i * (Math.PI * 2 / 3);

        const px =
            Math.cos(angle) * size;

        const py =
            Math.sin(angle) * size;

        if (i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    }

    ctx.closePath();

    ctx.stroke();

    ctx.restore();
}

function drawCube(x, y) {

    const size = 100;

    ctx.save();

    ctx.translate(x, y);

    ctx.rotate(rotation * 0.5);

    const offset = 40;

    // Front
    ctx.strokeRect(
        -size / 2,
        -size / 2,
        size,
        size
    );

    // Back
    ctx.strokeRect(
        -size / 2 + offset,
        -size / 2 - offset,
        size,
        size
    );

    // Connections
    const corners = [
        [-size / 2, -size / 2],
        [size / 2, -size / 2],
        [-size / 2, size / 2],
        [size / 2, size / 2]
    ];

    corners.forEach(([cx, cy]) => {

        ctx.beginPath();

        ctx.moveTo(cx, cy);

        ctx.lineTo(
            cx + offset,
            cy - offset
        );

        ctx.stroke();
    });

    ctx.restore();
}

// ===============================
// DRAW SHAPE
// ===============================
function drawShape() {

    const x = handX * canvas.width;
    const y = handY * canvas.height;

    ctx.save();

    ctx.lineWidth = 4;

    ctx.shadowBlur = 25;

    ctx.beginPath();

    switch (currentGesture) {

        case "CIRCLE":
            drawCircle(x, y);
            break;

        case "HEART":
            drawHeart(x, y);
            break;

        case "CUBE":
            drawCube(x, y);
            break;

        case "TRIANGLE":
            drawTriangle(x, y);
            break;

        case "CHAOS":

            for (let i = 0; i < 4; i++) {

                particles.push(
                    new Particle(
                        x,
                        y,
                        0.5
                    )
                );
            }

            break;
    }

    ctx.restore();
}

// ===============================
// MAIN LOOP
// ===============================
async function loop() {

    if (!handLandmarker) {

        requestAnimationFrame(loop);
        return;
    }

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    rotation += 0.02;
    pulse += 0.08;

    if (
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
    ) {

        lastVideoTime = video.currentTime;

        const results =
            handLandmarker.detectForVideo(
                video,
                performance.now()
            );

        if (
            results.landmarks &&
            results.landmarks.length > 0
        ) {

            const landmarks =
                results.landmarks[0];

            // Hand center
            let targetX = 0;
            let targetY = 0;

            for (const point of landmarks) {

                targetX += point.x;
                targetY += point.y;
            }

            targetX /= landmarks.length;
            targetY /= landmarks.length;

            handX +=
                (targetX - handX) *
                smoothing;

            handY +=
                (targetY - handY) *
                smoothing;

            const fingers =
                countFingers(landmarks);

            const gesture =
                getGesture(fingers);

            fingerText.textContent =
                `${fingers} fingers`;

            gestureText.textContent =
                gesture;

            updateGesture(gesture);

        } else {

            fingerText.textContent =
                "No hand";

            gestureText.textContent =
                "Waiting...";
        }
    }

    drawShape();
    updateParticles();

    requestAnimationFrame(loop);
}

// ===============================
// SWITCH CAMERA
// ===============================
switchCamera.addEventListener(
    "click",
    async () => {

        facingMode =
            facingMode === "user"
                ? "environment"
                : "user";

        lastVideoTime = -1;

        await startCamera();
    }
);

// ===============================
// START
// ===============================
initHandTracking();
