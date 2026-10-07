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
// GESTURE
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
// MORPH PARTICLES
// ==========================================

const morphParticles = [];

const PARTICLE_COUNT = 260;

let morphing = false;
let morphProgress = 1;

const MORPH_DURATION = 750;

// ==========================================
// INIT
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

        requestAnimationFrame(loop);

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
// MATH
// ==========================================

function lerp(a, b, t) {

    return a + (b - a) * t;
}

function easeInOut(t) {

    return t < 0.5
        ? 2 * t * t
        : 1 -
          Math.pow(-2 * t + 2, 2) / 2;
}

// ==========================================
// SHAPE POINT GENERATORS
// ==========================================

function generateCirclePoints(
    count,
    radius
) {

    const points = [];

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const angle =
            (i / count) *
            Math.PI *
            2;

        points.push({

            x:
                Math.cos(angle) *
                radius,

            y:
                Math.sin(angle) *
                radius
        });
    }

    return points;
}

// ------------------------------------------

function generateHeartPoints(
    count,
    scale
) {

    const points = [];

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const t =
            (i / count) *
            Math.PI *
            2;

        const x =
            16 *
            Math.pow(
                Math.sin(t),
                3
            );

        const y =
            -(
                13 *
                    Math.cos(t) -
                5 *
                    Math.cos(2 * t) -
                2 *
                    Math.cos(3 * t) -
                Math.cos(4 * t)
            );

        points.push({

            x: x * scale,

            y: y * scale
        });
    }

    return points;
}

// ------------------------------------------

function generateTrianglePoints(
    count,
    size
) {

    const vertices = [

        {
            x: 0,
            y: -size
        },

        {
            x: size,
            y: size
        },

        {
            x: -size,
            y: size
        }
    ];

    const points = [];

    const perSide =
        Math.floor(
            count / 3
        );

    for (
        let side = 0;
        side < 3;
        side++
    ) {

        const a =
            vertices[side];

        const b =
            vertices[
                (side + 1) % 3
            ];

        for (
            let i = 0;
            i < perSide;
            i++
        ) {

            const t =
                i / perSide;

            points.push({

                x:
                    lerp(
                        a.x,
                        b.x,
                        t
                    ),

                y:
                    lerp(
                        a.y,
                        b.y,
                        t
                    )
            });
        }
    }

    return points;
}

// ------------------------------------------

function generateCubePoints(
    count,
    size
) {

    const s = size;
    const o = size * 0.38;

    const lines = [

        // Front
        [
            [-s, -s],
            [s, -s]
        ],

        [
            [s, -s],
            [s, s]
        ],

        [
            [s, s],
            [-s, s]
        ],

        [
            [-s, s],
            [-s, -s]
        ],

        // Back
        [
            [-s + o, -s - o],
            [s + o, -s - o]
        ],

        [
            [s + o, -s - o],
            [s + o, s - o]
        ],

        [
            [s + o, s - o],
            [-s + o, s - o]
        ],

        [
            [-s + o, s - o],
            [-s + o, -s - o]
        ],

        // Connections
        [
            [-s, -s],
            [-s + o, -s - o]
        ],

        [
            [s, -s],
            [s + o, -s - o]
        ],

        [
            [s, s],
            [s + o, s - o]
        ],

        [
            [-s, s],
            [-s + o, s - o]
        ]
    ];

    const points = [];

    const perLine =
        Math.ceil(
            count / lines.length
        );

    for (
        const line of lines
    ) {

        const a = {
            x: line[0][0],
            y: line[0][1]
        };

        const b = {
            x: line[1][0],
            y: line[1][1]
        };

        for (
            let i = 0;
            i < perLine;
            i++
        ) {

            const t =
                i / perLine;

            points.push({

                x:
                    lerp(
                        a.x,
                        b.x,
                        t
                    ),

                y:
                    lerp(
                        a.y,
                        b.y,
                        t
                    )
            });
        }
    }

    return points;
}

// ==========================================
// GET SHAPE POINTS
// ==========================================

function getShapePoints(
    gesture,
    count
) {

    switch (gesture) {

        case "CIRCLE":

            return generateCirclePoints(
                count,
                110
            );

        case "HEART":

            return generateHeartPoints(
                count,
                7
            );

        case "TRIANGLE":

            return generateTrianglePoints(
                count,
                125
            );

        case "CUBE":

            return generateCubePoints(
                count,
                75
            );

        default:

            return generateCirclePoints(
                count,
                110
            );
    }
}

// ==========================================
// MORPH PARTICLE
// ==========================================

class MorphParticle {

    constructor() {

        this.x = 0;
        this.y = 0;

        this.startX = 0;
        this.startY = 0;

        this.targetX = 0;
        this.targetY = 0;

        this.vx = 0;
        this.vy = 0;

        this.size =
            Math.random() *
            2.5 +
            1;

        this.alpha = 1;

        this.delay =
            Math.random() *
            0.2;

        this.noise =
            Math.random() *
            Math.PI *
            2;
    }

    update(progress) {

        let t =
            Math.max(
                0,
                Math.min(
                    1,
                    (progress -
                        this.delay) /
                        (1 -
                            this.delay)
                )
            );

        t = easeInOut(t);

        // Main morph
        this.x =
            lerp(
                this.startX,
                this.targetX,
                t
            );

        this.y =
            lerp(
                this.startY,
                this.targetY,
                t
            );

        // Explosion offset
        const explosion =
            Math.sin(
                t * Math.PI
            );

        const angle =
            this.noise +
            t * 4;

        this.x +=
            Math.cos(angle) *
            explosion *
            35;

        this.y +=
            Math.sin(angle) *
            explosion *
            35;

        this.alpha =
            0.35 +
            0.65 *
                Math.sin(
                    Math.PI *
                        Math.min(
                            1,
                            t + 0.1
                        )
                );
    }

    draw(cx, cy) {

        ctx.globalAlpha =
            this.alpha;

        ctx.beginPath();

        ctx.arc(
            cx + this.x,
            cy + this.y,
            this.size,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.globalAlpha = 1;
    }
}

// ==========================================
// CREATE MORPH
// ==========================================

function createMorph(
    fromGesture,
    toGesture
) {

    const fromPoints =
        getShapePoints(
            fromGesture,
            PARTICLE_COUNT
        );

    const targetPoints =
        getShapePoints(
            toGesture,
            PARTICLE_COUNT
        );

    morphParticles.length = 0;

    for (
        let i = 0;
        i < PARTICLE_COUNT;
        i++
    ) {

        const start =
            fromPoints[
                i %
                    fromPoints.length
            ];

        const target =
            targetPoints[
                i %
                    targetPoints.length
            ];

        const particle =
            new MorphParticle();

        particle.startX =
            start.x;

        particle.startY =
            start.y;

        particle.targetX =
            target.x;

        particle.targetY =
            target.y;

        particle.x =
            start.x;

        particle.y =
            start.y;

        morphParticles.push(
            particle
        );
    }

    morphing = true;

    morphProgress = 0;
}

// ==========================================
// DRAW MORPH
// ==========================================

let morphStartTime = 0;

function updateMorph() {

    if (!morphing)
        return;

    if (
        morphStartTime === 0
    ) {

        morphStartTime =
            performance.now();
    }

    const elapsed =
        performance.now() -
        morphStartTime;

    morphProgress =
        Math.min(
            1,
            elapsed /
                MORPH_DURATION
        );

    for (
        const particle
        of morphParticles
    ) {

        particle.update(
            morphProgress
        );
    }

    if (
        morphProgress >= 1
    ) {

        morphing = false;

        morphStartTime = 0;
    }
}

// ==========================================
// DRAW MORPH PARTICLES
// ==========================================

function drawMorph() {

    const cx =
        handX *
        canvas.width;

    const cy =
        handY *
        canvas.height;

    ctx.save();

    ctx.shadowBlur = 20;

    for (
        const particle
        of morphParticles
    ) {

        particle.draw(
            cx,
            cy
        );
    }

    ctx.restore();
}

// ==========================================
// START MORPH
// ==========================================

function startShapeTransition(
    oldGesture,
    newGesture
) {

    if (
        oldGesture === "NONE"
    ) {

        createMorph(
            "CIRCLE",
            newGesture
        );

    } else {

        createMorph(
            oldGesture,
            newGesture
        );
    }
}

// ==========================================
// FINGER DETECTION
// ==========================================

function distance(a, b) {

    const dx =
        a.x - b.x;

    const dy =
        a.y - b.y;

    const dz =
        a.z - b.z;

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}

function countFingers(hand) {

    let count = 0;

    if (
        hand[8].y <
        hand[6].y
    ) count++;

    if (
        hand[12].y <
        hand[10].y
    ) count++;

    if (
        hand[16].y <
        hand[14].y
    ) count++;

    if (
        hand[20].y <
        hand[18].y
    ) count++;

    const thumbTip =
        hand[4];

    const thumbIP =
        hand[3];

    const thumbBase =
        hand[5];

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

        count++;
    }

    return count;
}

// ==========================================
// GESTURE
// ==========================================

function getGesture(
    fingers
) {

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

    return "NONE";
}

// ==========================================
// GESTURE SMOOTHING
// ==========================================

function updateGesture(
    gesture
) {

    if (
        gesture ===
        candidateGesture
    ) {

        candidateFrames++;

    } else {

        candidateGesture =
            gesture;

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

            const oldGesture =
                currentGesture;

            currentGesture =
                candidateGesture;

            console.log(
                "MORPH:",
                oldGesture,
                "→",
                currentGesture
            );

            if (
                currentGesture !==
                "NONE"
            ) {

                startShapeTransition(
                    oldGesture,
                    currentGesture
                );
            }
        }
    }
}

// ==========================================
// DRAW FINAL SHAPE
// ==========================================

function drawFinalShape() {

    if (morphing)
        return;

    if (
        currentGesture ===
        "NONE"
    )
        return;

    const x =
        handX *
        canvas.width;

    const y =
        handY *
        canvas.height;

    ctx.save();

    ctx.translate(
        x,
        y
    );

    ctx.rotate(
        rotation
    );

    ctx.lineWidth = 4;

    ctx.shadowBlur = 25;

    if (
        currentGesture ===
        "CIRCLE"
    ) {

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            110 +
                Math.sin(
                    pulse
                ) *
                    8,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    else if (
        currentGesture ===
        "HEART"
    ) {

        const points =
            generateHeartPoints(
                160,
                7
            );

        ctx.beginPath();

        points.forEach(
            (
                point,
                index
            ) => {

                if (
                    index === 0
                ) {

                    ctx.moveTo(
                        point.x,
                        point.y
                    );

                } else {

                    ctx.lineTo(
                        point.x,
                        point.y
                    );
                }
            }
        );

        ctx.closePath();

        ctx.stroke();
    }

    else if (
        currentGesture ===
        "TRIANGLE"
    ) {

        const points =
            generateTrianglePoints(
                180,
                125
            );

        ctx.beginPath();

        points.forEach(
            (
                point,
                index
            ) => {

                if (
                    index === 0
                ) {

                    ctx.moveTo(
                        point.x,
                        point.y
                    );

                } else {

                    ctx.lineTo(
                        point.x,
                        point.y
                    );
                }
            }
        );

        ctx.closePath();

        ctx.stroke();
    }

    else if (
        currentGesture ===
        "CUBE"
    ) {

        const points =
            generateCubePoints(
                220,
                75
            );

        ctx.beginPath();

        for (
            let i = 0;
            i <
            points.length - 1;
            i++
        ) {

            ctx.moveTo(
                points[i].x,
                points[i].y
            );

            ctx.lineTo(
                points[i + 1].x,
                points[i + 1].y
            );
        }

        ctx.stroke();
    }

    ctx.restore();
}

// ==========================================
// CHAOS PARTICLES
// ==========================================

function drawChaos() {

    if (
        currentGesture !==
        "CHAOS"
    )
        return;

    const x =
        handX *
        canvas.width;

    const y =
        handY *
        canvas.height;

    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const particle =
            new MorphParticle();

        particle.x =
            Math.random() *
                300 -
            150;

        particle.y =
            Math.random() *
                300 -
            150;

        particle.size =
            Math.random() *
                4 +
            1;

        particle.alpha =
            Math.random();

        particle.draw(
            x,
            y
        );
    }
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

    rotation +=
        0.008;

    pulse +=
        0.08;

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
        }
    }

    updateMorph();

    if (morphing) {

        drawMorph();

    } else {

        drawFinalShape();

        drawChaos();
    }

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
