(function () {
    'use strict';

    // ===========================================
    // CONFIGURATION
    // ===========================================
    const CONFIG = {
        countdownSeconds: 7,
        maxRecordingSeconds: 60,
        finalCountdownStart: 50,   // seconds elapsed when final countdown begins
        thankYouDuration: 8000,     // ms before returning to home
        saveMethod: 'local'         // 'local' or 'gdrive'
    };

    // ===========================================
    // STATE
    // ===========================================
    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordingStartTime = null;
    let timerInterval = null;
    let countdownInterval = null;
    let finalCountdownInterval = null;
    let recordedBlob = null;
    let videoCounter = 0;

    // ===========================================
    // DOM REFERENCES
    // ===========================================
    const screens = {
        home: document.getElementById('screen-home'),
        countdown: document.getElementById('screen-countdown'),
        recording: document.getElementById('screen-recording'),
        review: document.getElementById('screen-review'),
        thankyou: document.getElementById('screen-thankyou')
    };

    const elements = {
        btnStart: document.getElementById('btn-start'),
        btnFinish: document.getElementById('btn-finish'),
        btnSave: document.getElementById('btn-save'),
        btnRetry: document.getElementById('btn-retry'),
        countdownNumber: document.getElementById('countdown-number'),
        videoPreviewCountdown: document.getElementById('video-preview-countdown'),
        videoPreviewRecording: document.getElementById('video-preview-recording'),
        videoPlayback: document.getElementById('video-playback'),
        timerDisplay: document.getElementById('timer-display'),
        progressBar: document.getElementById('progress-bar'),
        finalCountdownOverlay: document.getElementById('final-countdown-overlay'),
        finalCountdownNumber: document.getElementById('final-countdown-number'),
        overlaySaving: document.getElementById('overlay-saving')
    };

    // ===========================================
    // SCREEN MANAGEMENT
    // ===========================================
    function showScreen(screenName) {
        Object.keys(screens).forEach(key => {
            screens[key].classList.remove('active');
        });
        screens[screenName].classList.add('active');
    }

    // ===========================================
    // CAMERA
    // ===========================================
    async function startCamera() {
        try {
            // Stop any existing stream
            stopCamera();

            const constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: true
            };

            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            elements.videoPreviewCountdown.srcObject = mediaStream;
            elements.videoPreviewRecording.srcObject = mediaStream;

            return true;
        } catch (err) {
            console.error('Camera access error:', err);
            alert('Camera access is needed to record a video message. Please allow camera access and try again.');
            return false;
        }
    }

    function stopCamera() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        elements.videoPreviewCountdown.srcObject = null;
        elements.videoPreviewRecording.srcObject = null;
    }

    // ===========================================
    // COUNTDOWN (Before Recording)
    // ===========================================
    function startCountdown() {
        let remaining = CONFIG.countdownSeconds;
        elements.countdownNumber.textContent = remaining;

        showScreen('countdown');

        countdownInterval = setInterval(() => {
            remaining--;
            elements.countdownNumber.textContent = remaining;

            if (remaining <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                startRecording();
            }
        }, 1000);
    }

    // ===========================================
    // RECORDING
    // ===========================================
    function startRecording() {
        recordedChunks = [];
        recordedBlob = null;

        // Determine supported mime type
        let mimeType = '';
        const types = [
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }

        const options = mimeType ? { mimeType } : {};

        try {
            mediaRecorder = new MediaRecorder(mediaStream, options);
        } catch (e) {
            console.warn('MediaRecorder creation with options failed, trying default', e);
            mediaRecorder = new MediaRecorder(mediaStream);
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const type = mediaRecorder.mimeType || 'video/webm';
            recordedBlob = new Blob(recordedChunks, { type });
            showReviewScreen();
        };

        mediaRecorder.start(1000); // collect data every second
        recordingStartTime = Date.now();

        // Reset UI
        elements.timerDisplay.textContent = '0:00';
        elements.progressBar.style.width = '0%';
        elements.progressBar.classList.remove('warning');
        elements.finalCountdownOverlay.classList.add('hidden');

        showScreen('recording');
        startTimer();
    }

    function stopRecording() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (finalCountdownInterval) {
            clearInterval(finalCountdownInterval);
            finalCountdownInterval = null;
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    // ===========================================
    // TIMER & PROGRESS
    // ===========================================
    function startTimer() {
        timerInterval = setInterval(() => {
            const elapsed = (Date.now() - recordingStartTime) / 1000;
            updateTimerDisplay(elapsed);
            updateProgressBar(elapsed);

            // Start final countdown at 50 seconds
            if (elapsed >= CONFIG.finalCountdownStart && !finalCountdownInterval) {
                startFinalCountdown();
            }

            // Auto-stop at 60 seconds
            if (elapsed >= CONFIG.maxRecordingSeconds) {
                stopRecording();
            }
        }, 250);
    }

    function updateTimerDisplay(elapsedSeconds) {
        const secs = Math.floor(elapsedSeconds);
        const mins = Math.floor(secs / 60);
        const remainSecs = secs % 60;
        elements.timerDisplay.textContent = `${mins}:${remainSecs.toString().padStart(2, '0')}`;
    }

    function updateProgressBar(elapsedSeconds) {
        const percent = Math.min((elapsedSeconds / CONFIG.maxRecordingSeconds) * 100, 100);
        elements.progressBar.style.width = percent + '%';

        if (elapsedSeconds >= CONFIG.finalCountdownStart) {
            elements.progressBar.classList.add('warning');
        }
    }

    // ===========================================
    // FINAL COUNTDOWN (last 10 seconds)
    // ===========================================
    function startFinalCountdown() {
        elements.finalCountdownOverlay.classList.remove('hidden');
        let remaining = CONFIG.maxRecordingSeconds - CONFIG.finalCountdownStart;

        const updateDisplay = () => {
            const elapsed = (Date.now() - recordingStartTime) / 1000;
            remaining = Math.ceil(CONFIG.maxRecordingSeconds - elapsed);
            if (remaining < 0) remaining = 0;
            elements.finalCountdownNumber.textContent = remaining;
        };

        updateDisplay();
        finalCountdownInterval = setInterval(updateDisplay, 250);
    }

    // ===========================================
    // REVIEW SCREEN
    // ===========================================
    function showReviewScreen() {
        if (recordedBlob) {
            const url = URL.createObjectURL(recordedBlob);
            elements.videoPlayback.src = url;
            elements.videoPlayback.load();
        }
        showScreen('review');
    }

    // ===========================================
    // SAVE VIDEO
    // ===========================================
    async function saveVideo() {
        if (!recordedBlob) {
            alert('No video recorded. Please try again.');
            return;
        }

        elements.overlaySaving.classList.remove('hidden');

        try {
            if (CONFIG.saveMethod === 'gdrive') {
                await saveToGoogleDrive(recordedBlob);
            } else {
                saveLocally(recordedBlob);
            }

            elements.overlaySaving.classList.add('hidden');
            showThankYou();
        } catch (err) {
            console.error('Save error:', err);
            elements.overlaySaving.classList.add('hidden');
            // Fall back to local save
            saveLocally(recordedBlob);
            showThankYou();
        }
    }

    function saveLocally(blob) {
        videoCounter++;
        const timestamp = getTimestamp();
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const filename = `video_message_${timestamp}.${extension}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Revoke after a delay
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function getTimestamp() {
        const now = new Date();
        return now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') + '_' +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
    }

    // ===========================================
    // GOOGLE DRIVE SAVE (Optional - requires setup)
    // ===========================================
    async function saveToGoogleDrive(blob) {
        // =====================================================
        // TO USE GOOGLE DRIVE:
        // 1. Create a Google Cloud project
        // 2. Enable the Google Drive API
        // 3. Create OAuth 2.0 credentials (or use a service account)
        // 4. Set your API key and folder ID below
        // 5. Change CONFIG.saveMethod to 'gdrive'
        // =====================================================

        const GOOGLE_DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE'; // Replace with OAuth token
        const FOLDER_ID = 'YOUR_FOLDER_ID_HERE';       // Replace with Drive folder ID

        const timestamp = getTimestamp();
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const filename = `video_message_${timestamp}.${extension}`;

        const metadata = {
            name: filename,
            mimeType: blob.type,
            parents: [FOLDER_ID]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const response = await fetch(GOOGLE_DRIVE_API, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + ACCESS_TOKEN
            },
            body: form
        });

        if (!response.ok) {
            throw new Error('Google Drive upload failed: ' + response.status);
        }

        return response.json();
    }

    // ===========================================
    // THANK YOU SCREEN
    // ===========================================
    function showThankYou() {
        // Stop camera since we're done
        stopCamera();

        // Clean up playback
        elements.videoPlayback.src = '';

        showScreen('thankyou');

        setTimeout(() => {
            resetToHome();
        }, CONFIG.thankYouDuration);
    }

    // ===========================================
    // RESET
    // ===========================================
    function resetToHome() {
        // Clear all intervals
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (finalCountdownInterval) {
            clearInterval(finalCountdownInterval);
            finalCountdownInterval = null;
        }

        // Stop recording if active
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        mediaRecorder = null;

        // Stop camera
        stopCamera();

        // Clean up
        recordedChunks = [];
        recordedBlob = null;
        elements.videoPlayback.src = '';
        elements.finalCountdownOverlay.classList.add('hidden');
        elements.progressBar.style.width = '0%';
        elements.progressBar.classList.remove('warning');
        elements.timerDisplay.textContent = '0:00';

        showScreen('home');
    }

    // ===========================================
    // EVENT LISTENERS
    // ===========================================
    elements.btnStart.addEventListener('click', async () => {
        elements.btnStart.disabled = true;
        const cameraOk = await startCamera();
        elements.btnStart.disabled = false;

        if (cameraOk) {
            startCountdown();
        }
    });

    elements.btnFinish.addEventListener('click', () => {
        stopRecording();
    });

    elements.btnSave.addEventListener('click', () => {
        // Pause playback
        elements.videoPlayback.pause();
        saveVideo();
    });

    elements.btnRetry.addEventListener('click', async () => {
        // Clean up
        elements.videoPlayback.src = '';
        recordedChunks = [];
        recordedBlob = null;

        const cameraOk = await startCamera();
        if (cameraOk) {
            startCountdown();
        } else {
            resetToHome();
        }
    });

    // ===========================================
    // INITIALIZATION
    // ===========================================
    showScreen('home');

})();
