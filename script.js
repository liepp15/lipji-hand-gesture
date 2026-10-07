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

const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker;
let lastVideoTime = -1;

async function init() {
    try {
        console.log("Loading MediaPipe...");

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

                minHandDetectionConfidence: 0.3,
                minHandPresenceConfidence: 0.3,
                minTrackingConfidence: 0.3
            }
        );

        console.log("MediaPipe READY");

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

        loading.style.display = "none";

        resize();

        requestAnimationFrame(loop);

    } catch (error) {

        console.error("INIT ERROR:", error);

        loading.innerHTML = `
            <p style="color:red">
                ERROR: ${error.message}
            </p>
        `;
    }
}

function resize() {

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);

function loop() {

    if (
        handLandmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
    ) {

        lastVideoTime = video.currentTime;

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
            results.landmarks.length > 0
        ) {

            const hand = results.landmarks[0];

            console.log("HAND FOUND");

            gestureText.textContent = "HAND DETECTED";

            drawLandmarks(hand);

        } else {

            gestureText.textContent = "NO HAND";

            fingerText.textContent = "0 fingers";
        }
    }

    requestAnimationFrame(loop);
}

function drawLandmarks(hand) {

    ctx.fillStyle = "#00ffcc";

    for (const point of hand) {

        const x = point.x * canvas.width;
        const y = point.y * canvas.height;

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            7,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    // connections
    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],
        [0,17]
    ];

    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 3;

    for (const [a,b] of connections) {

        const p1 = hand[a];
        const p2 = hand[b];

        ctx.beginPath();

        ctx.moveTo(
            p1.x * canvas.width,
            p1.y * canvas.height
        );

        ctx.lineTo(
            p2.x * canvas.width,
            p2.y * canvas.height
        );

        ctx.stroke();
    }
}

init();
