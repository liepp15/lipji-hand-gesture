import {
    HandLandmarker,
    FilesetResolver
} from "@mediapipe/tasks-vision";

// ==========================================
// ELEMENTS
// ==========================================

const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gestureText = document.getElementById("gesture");
const fingerText = document.getElementById("fingerCount");
const loading = document.getElementById("loading");
const switchCamera = document.getElementById("switchCamera");

// ==========================================
// MEDIAPIPE
// ==========================================

const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker = null;

let stream = null;

let facingMode = "user";

let lastVideoTime = -1;

// ==========================================
// GESTURE STATE
// ==========================================

let currentGesture = "NONE";

let candidateGesture = "NONE";

let candidateFrames = 0;

const gestureConfirmFrames = 5;

// ==========================================
// HAND POSITION
// ==========================================

let handX = 0.5;
let handY = 0.5;

const positionSmoothing = 0.2;

// ==========================================
// ANIMATION
// ==========================================

let rotation = 0;

let pulse = 0;

// ==========================================
// PARTICLES
// ==========================================

const particles = [];

// ==========================================
// INITIALIZE
// ==========================================

async function init() {

    try {

        console.log("Loading MediaPipe...");

        const vision =
            await FilesetResolver.forVisionTasks(
                WASM_URL
            );

        handLandmarker =
            await HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: MODEL_URL,
                        delegate: "GPU"
                    },

                    runningMode: "VIDEO",

                    numHands: 1,

                    minHandDetectionConfidence: 0.3,

                    minHandPresenceConfidence: 0.3,

                    minTrackingConfidence: 0.3
                }
            );

        console.log("MediaPipe READY");

        await startCamera();

        loading.style.display = "none";

    } catch (error) {

        console.error("INIT ERROR:", error);

        loading.innerHTML = `
            <div style="
                color:#ff5555;
                text-align:center;
                padding:20px;
            ">
                <h3>Hand Tracking Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ==========================================
// CAMERA
// ==========================================

async function startCamera() {

    try {

        // Stop old camera
        if (stream) {

            stream
                .getTracks()
                .forEach(track => track.stop());
        }

        stream =
            await navigator.mediaDevices.getUserMedia({

                video: {

                    facingMode: facingMode,

                    width: {
                        ideal: 640
                    },

                    height: {
                        ideal: 480
                    },

                    frameRate: {
                        ideal: 30,
                        max: 30
                    }
                },

                audio: false
            });

        video.srcObject = stream;

        await video.play();

        console.log(
            "VIDEO:",
            video.videoWidth,
            "x",
            video.videoHeight
        );

        resizeCanvas();

        lastVideoTime = -1;

    } catch (error) {

        console.error(
            "CAMERA ERROR:",
            error
        );

        loading.innerHTML = `
            <div style="
                color:#ff5555;
                text-align:center;
                padding:20px;
            ">
                <h3>Camera Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ==========================================
// CANVAS
// ==========================================

function resizeCanvas() {

    canvas.width = window.innerWidth;

    canvas.height = window.innerHeight;
}

window.addEventListener(
    "resize",
    resizeCanvas
);

// ==========================================
// DISTANCE
// ==========================================

function distance(a, b) {

    const dx = a.x - b.x;

    const dy = a.y - b.y;

    const dz = a.z - b.z;

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}

// ==========================================
// FINGER DETECTION
// ==========================================

function countFingers(hand) {

    let fingers = 0;

    // INDEX
    if (
        hand[8].y <
        hand[6].y
    ) {
        fingers++;
    }

    // MIDDLE
    if (
        hand[12].y <
        hand[10].y
    ) {
        fingers++;
    }

    // RING
    if (
        hand[16].y <
        hand[14].y
    ) {
        fingers++;
    }

    // PINKY
    if (
        hand[20].y <
        hand[18].y
    ) {
        fingers++;
    }

    // THUMB
    const thumbTip = hand[4];

    const thumbIP = hand[3];

    const thumbBase = hand[5];

    if (
        distance(
            thumbTip,
            thumbBase
        ) >
        distance(
            thumbIP,
            thumbBase
        )
    ) {
        fingers++;
    }

    return fingers;
}

// ==========================================
// GESTURE MAPPING
// ==========================================

function getGesture(fingers) {

    if (fingers === 0) {

        return "CIRCLE";
    }

    if (fingers === 1) {

        return "HEART";
    }

    if (fingers === 2) {

        return "CUBE";
    }

    if (fingers === 3) {

        return "TRIANGLE";
    }

    if (fingers === 5) {

        return "CHAOS";
    }

    return "NONE";
}

// ==========================================
// GESTURE SMOOTHING
// ==========================================

function updateGesture(newGesture) {

    if (
        newGesture ===
        candidateGesture
    ) {

        candidateFrames++;

    } else {

        candidateGesture =
            newGesture;

        candidateFrames = 0;
    }

    if (
        candidateFrames >=
        gestureConfirmFrames
    ) {

        if (
            currentGesture !==
            candidateGesture
        ) {

            explodeShape();

            currentGesture =
                candidateGesture;

            console.log(
                "GESTURE:",
                currentGesture
            );
        }
    }
}

// ==========================================
// PARTICLE CLASS
// ==========================================

class Particle {

    constructor(
        x,
        y,
        power = 1
    ) {

        this.x = x;

        this.y = y;

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            (
                Math.random() *
                8 +
                2
            ) * power;

        this.vx =
            Math.cos(angle) *
            speed;

        this.vy =
            Math.sin(angle) *
            speed;

        this.life = 1;

        this.size =
            Math.random() *
            4 +
            1;
    }

    update() {

        this.x += this.vx;

        this.y += this.vy;

        this.vx *= 0.97;

        this.vy *= 0.97;

        this.life -= 0.025;
    }

    draw() {

        ctx.globalAlpha =
            this.life;

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

// ==========================================
// EXPLOSION
// ==========================================

function explodeShape() {

    const x =
        handX *
        canvas.width;

    const y =
        handY *
        canvas.height;

    for (
        let i = 0;
        i < 80;
        i++
    ) {

        particles.push(
            new Particle(
                x,
                y,
                Math.random() *
                    2 +
                    0.5
            )
        );
    }
}

// ==========================================
// PARTICLE UPDATE
// ==========================================

function updateParticles() {

    for (
        let i =
            particles.length -
            1;

        i >= 0;

        i--
    ) {

        particles[i].update();

        if (
            particles[i].life <=
            0
        ) {

            particles.splice(
                i,
                1
            );

        } else {

            particles[i].draw();
        }
    }
}

// ==========================================
// CIRCLE
// ==========================================

function drawCircle(
    x,
    y
) {

    const radius =
        100 +
        Math.sin(pulse) *
        10;

    ctx.lineWidth = 6;

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

// ==========================================
// HEART
// ==========================================

function drawHeart(
    x,
    y
) {

    ctx.save();

    ctx.translate(
        x,
        y
    );

    ctx.scale(
        4.5,
        4.5
    );

    ctx.beginPath();

    ctx.moveTo(
        0,
        30
    );

    ctx.bezierCurveTo(
        -50,
        -5,
        -40,
        -45,
        0,
        -20
    );

    ctx.bezierCurveTo(
        40,
        -45,
        50,
        -5,
        0,
        30
    );

    ctx.stroke();

    ctx.restore();
}

// ==========================================
// TRIANGLE
// ==========================================

function drawTriangle(
    x,
    y
) {

    const size = 120;

    ctx.save();

    ctx.translate(
        x,
        y
    );

    ctx.rotate(
        rotation
    );

    ctx.beginPath();

    for (
        let i = 0;
        i < 3;
        i++
    ) {

        const angle =
            -Math.PI / 2 +
            i *
                (
                    Math.PI *
                    2 /
                    3
                );

        const px =
            Math.cos(angle) *
            size;

        const py =
            Math.sin(angle) *
            size;

        if (i === 0) {

            ctx.moveTo(
                px,
                py
            );

        } else {

            ctx.lineTo(
                px,
                py
            );
        }
    }

    ctx.closePath();

    ctx.stroke();

    ctx.restore();
}

// ==========================================
// CUBE
// ==========================================

function drawCube(
    x,
    y
) {

    const size = 100;

    const offset = 40;

    ctx.save();

    ctx.translate(
        x,
        y
    );

    ctx.rotate(
        rotation * 0.5
    );

    // Front

    ctx.strokeRect(
        -size / 2,
        -size / 2,
        size,
        size
    );

    // Back

    ctx.strokeRect(
        -size / 2 +
            offset,

        -size / 2 -
            offset,

        size,
        size
    );

    const corners = [

        [
            -size / 2,
            -size / 2
        ],

        [
            size / 2,
            -size / 2
        ],

        [
            -size / 2,
            size / 2
        ],

        [
            size / 2,
            size / 2
        ]
    ];

    for (
        const [
            cx,
            cy
        ] of corners
    ) {

        ctx.beginPath();

        ctx.moveTo(
            cx,
            cy
        );

        ctx.lineTo(
            cx + offset,
            cy - offset
        );

        ctx.stroke();
    }

    ctx.restore();
}

// ==========================================
// CHAOS
// ==========================================

function spawnChaos(
    x,
    y
) {

    for (
        let i = 0;
        i < 3;
        i++
    ) {

        particles.push(
            new Particle(
                x,
                y,
                0.4
            )
        );
    }
}

// ==========================================
// DRAW SHAPE
// ==========================================

function drawShape() {

    const x =
        handX *
        canvas.width;

    const y =
        handY *
        canvas.height;

    ctx.save();

    ctx.lineWidth = 5;

    ctx.shadowBlur = 25;

    switch (
        currentGesture
    ) {

        case "CIRCLE":

            drawCircle(
                x,
                y
            );

            break;

        case "HEART":

            drawHeart(
                x,
                y
            );

            break;

        case "CUBE":

            drawCube(
                x,
                y
            );

            break;

        case "TRIANGLE":

            drawTriangle(
                x,
                y
            );

            break;

        case "CHAOS":

            spawnChaos(
                x,
                y
            );

            break;
    }

    ctx.restore();
}

// ==========================================
// MAIN LOOP
// ==========================================

function loop() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    rotation += 0.02;

    pulse += 0.08;

    if (
        handLandmarker &&
        video.readyState >= 2 &&
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

        if (
            results.landmarks &&
            results.landmarks.length >
                0
        ) {

            const hand =
                results.landmarks[0];

            // ==========================
            // HAND FOUND
            // ==========================

            const message =
                "HAND FOUND";

            console.log(
                message
            );

            // ==========================
            // HAND CENTER
            // ==========================

            let targetX = 0;

            let targetY = 0;

            for (
                const point
                of hand
            ) {

                targetX +=
                    point.x;

                targetY +=
                    point.y;
            }

            targetX /=
                hand.length;

            targetY /=
                hand.length;

            handX +=
                (
                    targetX -
                    handX
                ) *
                positionSmoothing;

            handY +=
                (
                    targetY -
                    handY
                ) *
                positionSmoothing;

            // ==========================
            // FINGER COUNT
            // ==========================

            const fingers =
                countFingers(
                    hand
                );

            const gesture =
                getGesture(
                    fingers
                );

            fingerText.textContent =
                `${fingers} fingers`;

            gestureText.textContent =
                gesture;

            updateGesture(
                gesture
            );

        } else {

            gestureText.textContent =
                "NO HAND";

            fingerText.textContent =
                "0 fingers";
        }
    }

    drawShape();

    updateParticles();

    requestAnimationFrame(
        loop
    );
}

// ==========================================
// SWITCH CAMERA
// ==========================================

if (switchCamera) {

    switchCamera.addEventListener(
        "click",
        async () => {

            facingMode =
                facingMode ===
                "user"

                    ? "environment"

                    : "user";

            await startCamera();
        }
    );
}

// ==========================================
// START
// ==========================================

init();
