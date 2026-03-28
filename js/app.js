(function () {
    'use strict';

    // ===========================================
    // CONFIGURATION
    // ===========================================
    var CONFIG = {
        thankYouDuration: 8000,  // ms before returning to home
        saveMethod: 'local',     // 'local' or 'gdrive'
        // Google Drive settings (only if saveMethod is 'gdrive')
        gdrive: {
            // OPTION 1: Google Apps Script Web App (recommended - see README)
            scriptUrl: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE',
            // OPTION 2: Direct Drive API (requires OAuth)
            apiUrl: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            accessToken: 'YOUR_ACCESS_TOKEN_HERE',
            folderId: 'YOUR_FOLDER_ID_HERE'
        }
    };

    // ===========================================
    // STATE
    // ===========================================
    var capturedFile = null;
    var videoObjectUrl = null;
    var videoCounter = 0;

    // ===========================================
    // DOM REFERENCES
    // ===========================================
    var screens = {
        home: document.getElementById('screen-home'),
        review: document.getElementById('screen-review'),
        saving: document.getElementById('screen-saving'),
        thankyou: document.getElementById('screen-thankyou'),
        error: document.getElementById('screen-error')
    };

    var videoCapture = document.getElementById('video-capture');
    var videoPlayback = document.getElementById('video-playback');
    var btnSave = document.getElementById('btn-save');
    var btnRetry = document.getElementById('btn-retry');
    var btnErrorHome = document.getElementById('btn-error-home');
    var errorMessage = document.getElementById('error-message');

    // ===========================================
    // SCREEN MANAGEMENT
    // ===========================================
    function showScreen(name) {
        var key;
        for (key in screens) {
            if (screens.hasOwnProperty(key)) {
                screens[key].classList.remove('active');
            }
        }
        screens[name].classList.add('active');
    }

    // ===========================================
    // CLEANUP
    // ===========================================
    function cleanup() {
        if (videoObjectUrl) {
            URL.revokeObjectURL(videoObjectUrl);
            videoObjectUrl = null;
        }
        videoPlayback.removeAttribute('src');
        videoPlayback.load();
        capturedFile = null;
    }

    // ===========================================
    // RESET TO HOME
    // ===========================================
    function resetToHome() {
        cleanup();
        // Reset the file input so the same file can be re-selected
        videoCapture.value = '';
        showScreen('home');
    }

    // ===========================================
    // HANDLE VIDEO CAPTURE
    // When the user finishes recording with the native camera,
    // iOS returns the video file to our input element.
    // ===========================================
    function handleVideoCapture(event) {
        var file = event.target.files && event.target.files[0];

        if (!file) {
            // User cancelled the camera — stay on home screen
            return;
        }

        // Validate it's a video
        if (file.type && file.type.indexOf('video') === -1) {
            showError('That doesn\'t appear to be a video. Please try again.');
            return;
        }

        capturedFile = file;

        // Create object URL for playback
        if (videoObjectUrl) {
            URL.revokeObjectURL(videoObjectUrl);
        }
        videoObjectUrl = URL.createObjectURL(file);

        videoPlayback.src = videoObjectUrl;
        videoPlayback.load();

        showScreen('review');
    }

    // ===========================================
    // SAVE VIDEO
    // ===========================================
    function saveVideo() {
        if (!capturedFile) {
            showError('No video found. Please try again.');
            return;
        }

        showScreen('saving');

        if (CONFIG.saveMethod === 'gdrive') {
            saveToGoogleDrive(capturedFile);
        } else {
            saveLocally(capturedFile);
        }
    }

    // ===========================================
    // LOCAL SAVE
    // Uses a download link. On iOS/Safari this will
    // prompt the user or save to Files.
    // ===========================================
    function saveLocally(file) {
        videoCounter++;
        var timestamp = getTimestamp();
        var extension = getExtension(file);
        var filename = 'video_message_' + timestamp + '.' + extension;

        // Method 1: Try using a download link
        try {
            var url = URL.createObjectURL(file);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 5000);
        } catch (e) {
            // If download doesn't work on this iOS version,
            // the file is still captured and could be uploaded
            console.log('Direct download not supported, file is captured in memory.');
        }

        // Show thank you regardless
        showThankYou();
    }

    // ===========================================
    // GOOGLE DRIVE SAVE VIA APPS SCRIPT
    // This is the recommended approach — no OAuth needed on client
    // ===========================================
    function saveToGoogleDrive(file) {
        var reader = new FileReader();

        reader.onload = function () {
            var base64 = reader.result.split(',')[1];
            var timestamp = getTimestamp();
            var extension = getExtension(file);
            var filename = 'video_message_' + timestamp + '.' + extension;

            var payload = {
                filename: filename,
                mimeType: file.type || 'video/mp4',
                data: base64
            };

            var xhr = new XMLHttpRequest();
            xhr.open('POST', CONFIG.gdrive.scriptUrl, true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            xhr.onload = function () {
                if (xhr.status === 200) {
                    showThankYou();
                } else {
                    console.error('Upload failed:', xhr.status, xhr.responseText);
                    // Fall back to local save
                    saveLocally(file);
                }
            };

            xhr.onerror = function () {
                console.error('Upload error');
                // Fall back to local save
                saveLocally(file);
            };

            xhr.send(JSON.stringify(payload));
        };

        reader.onerror = function () {
            console.error('FileReader error');
            saveLocally(file);
        };

        reader.readAsDataURL(file);
    }

    // ===========================================
    // THANK YOU SCREEN
    // ===========================================
    function showThankYou() {
        // Pause any playing video
        try { videoPlayback.pause(); } catch (e) {}

        showScreen('thankyou');

        setTimeout(function () {
            resetToHome();
        }, CONFIG.thankYouDuration);
    }

    // ===========================================
    // ERROR SCREEN
    // ===========================================
    function showError(msg) {
        errorMessage.textContent = msg || 'Please try again.';
        showScreen('error');
    }

    // ===========================================
    // UTILITIES
    // ===========================================
    function getTimestamp() {
        var now = new Date();
        return now.getFullYear().toString() +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) + '_' +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
    }

    function pad(n) {
        return n < 10 ? '0' + n : n.toString();
    }

    function getExtension(file) {
        if (file.name) {
            var parts = file.name.split('.');
            if (parts.length > 1) {
                return parts[parts.length - 1].toLowerCase();
            }
        }
        if (file.type) {
            if (file.type.indexOf('mp4') !== -1) return 'mp4';
            if (file.type.indexOf('quicktime') !== -1) return 'mov';
            if (file.type.indexOf('webm') !== -1) return 'webm';
        }
        return 'mov'; // default for iOS
    }

    // ===========================================
    // EVENT LISTENERS
    // ===========================================

    // Video capture from native camera
    videoCapture.addEventListener('change', handleVideoCapture);

    // Save button
    btnSave.addEventListener('click', function () {
        saveVideo();
    });

    // Retry button
    btnRetry.addEventListener('click', function () {
        cleanup();
        videoCapture.value = '';
        showScreen('home');
    });

    // Error screen home button
    btnErrorHome.addEventListener('click', function () {
        resetToHome();
    });

    // ===========================================
    // INIT
    // ===========================================
    showScreen('home');

})();
