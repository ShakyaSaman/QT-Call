package com.callqt.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class MainActivity extends AppCompatActivity {

    private static MainActivity sInstance;

    public static MainActivity getInstance() {
        return sInstance;
    }

    private static final int PERMISSION_REQ_CODE = 101;
    private static final int FILE_CHOOSER_REQ_CODE = 102;
    private static final int SCREEN_CAPTURE_REQ_CODE = 103;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    private MediaProjectionManager mediaProjectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private boolean isCapturingScreen = false;
    private long lastFrameTime = 0;

    // Native audio capture (microphone + system/playback audio) for screen share
    private static final int AUDIO_SAMPLE_RATE = 48000;
    private static final int AUDIO_CHUNK_BYTES = 1920; // 20ms of 16-bit mono @ 48kHz
    private AudioRecord micAudioRecord;
    private AudioRecord playbackAudioRecord;
    private Thread micAudioThread;
    private Thread playbackAudioThread;
    private volatile boolean isCapturingAudio = false;
    private volatile boolean nativeMicMuted = false;

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

        webView = new WebView(this);
        setContentView(webView);

        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);

        requestPermissionsIfNecessary();
        setupAudioMode();
        setupWebView();

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void setupAudioMode() {
        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setSpeakerphoneOn(true);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                    audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                            .setAudioAttributes(playbackAttributes)
                            .setAcceptsDelayedFocusGain(true)
                            .setOnAudioFocusChangeListener(focusChange -> {
                                // Keep communication audio mode alive when external media like YouTube plays
                            })
                            .build();
                    audioManager.requestAudioFocus(audioFocusRequest);
                } else {
                    audioManager.requestAudioFocus(focusChange -> {}, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void requestPermissionsIfNecessary() {
        String[] permissions = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        };

        boolean allGranted = true;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (!allGranted) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQ_CODE);
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.addJavascriptInterface(new WebAppInterface(), "AndroidNative");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // Grant WebRTC camera & microphone permissions
                    request.grant(request.getResources());
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQ_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Cannot open file chooser", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void startScreenShare() {
            runOnUiThread(() -> {
                if (mediaProjectionManager != null) {
                    Intent intent = mediaProjectionManager.createScreenCaptureIntent();
                    startActivityForResult(intent, SCREEN_CAPTURE_REQ_CODE);
                } else {
                    notifyJsScreenShareError("MediaProjection service not available");
                }
            });
        }

        @JavascriptInterface
        public void stopScreenShare() {
            runOnUiThread(() -> stopScreenCapture());
        }

        @JavascriptInterface
        public boolean isBatteryOptimizationIgnored() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    return pm.isIgnoringBatteryOptimizations(getPackageName());
                }
            }
            return true;
        }

        @JavascriptInterface
        public void openBatteryOptimizationSettings() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        Intent intent = new Intent();
                        intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    }
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        startActivity(intent);
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this, "Please disable Battery Restrictions for Call QT in Android Settings.", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isNativeAndroid() {
            return true;
        }

        @JavascriptInterface
        public void setMicMuted(boolean muted) {
            nativeMicMuted = muted;
        }
    }

    private void startScreenCapture() {
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
            int width = metrics.widthPixels / 2;
            int height = metrics.heightPixels / 2;
            int density = metrics.densityDpi;

            if (width % 2 != 0) width--;
            if (height % 2 != 0) height--;

            if (width < 320) width = 320;
            if (height < 240) height = 240;

            final int captureWidth = width;
            final int captureHeight = height;

            imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);

            startBackgroundThread();

            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    super.onStop();
                    runOnUiThread(() -> stopScreenCapture());
                }
            }, backgroundHandler);

            isCapturingScreen = true;

            imageReader.setOnImageAvailableListener(reader -> {
                if (!isCapturingScreen) return;
                long now = System.currentTimeMillis();
                if (now - lastFrameTime < 66) { // limit to ~15 FPS
                    Image img = reader.acquireLatestImage();
                    if (img != null) img.close();
                    return;
                }
                lastFrameTime = now;

                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image != null) {
                        Image.Plane[] planes = image.getPlanes();
                        ByteBuffer buffer = planes[0].getBuffer();
                        int pixelStride = planes[0].getPixelStride();
                        int rowStride = planes[0].getRowStride();
                        int rowPadding = rowStride - pixelStride * captureWidth;

                        Bitmap bitmap = Bitmap.createBitmap(captureWidth + rowPadding / pixelStride, captureHeight, Bitmap.Config.ARGB_8888);
                        bitmap.copyPixelsFromBuffer(buffer);

                        Bitmap croppedBitmap;
                        if (rowPadding == 0) {
                            croppedBitmap = bitmap;
                        } else {
                            croppedBitmap = Bitmap.createBitmap(bitmap, 0, 0, captureWidth, captureHeight);
                            bitmap.recycle();
                        }

                        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                        croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 60, byteArrayOutputStream);
                        croppedBitmap.recycle();
                        byte[] byteArray = byteArrayOutputStream.toByteArray();
                        String base64Image = Base64.encodeToString(byteArray, Base64.NO_WRAP);
                        String dataUrl = "data:image/jpeg;base64," + base64Image;

                        runOnUiThread(() -> {
                            if (isCapturingScreen && webView != null) {
                                webView.evaluateJavascript("window.onNativeScreenFrame && window.onNativeScreenFrame('" + dataUrl + "');", null);
                            }
                        });
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    if (image != null) {
                        image.close();
                    }
                }
            }, backgroundHandler);

            virtualDisplay = mediaProjection.createVirtualDisplay(
                    "NativeScreenShare",
                    width, height, density,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.getSurface(), null, null
            );

            // Capture microphone voice + device/system (YouTube) playback audio so both
            // are transmitted to the remote peer while screen sharing in the background.
            startNativeAudioCapture();

            runOnUiThread(() -> {
                if (webView != null) {
                    webView.evaluateJavascript("window.onNativeScreenShareStarted && window.onNativeScreenShareStarted();", null);
                }
            });
        } catch (Exception e) {
            notifyJsScreenShareError("Start screen capture error: " + e.getMessage());
        }
    }

    public void stopScreenCapture() {
        isCapturingScreen = false;
        stopNativeAudioCapture();
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        stopBackgroundThread();

        try {
            Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
            stopService(serviceIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }

        if (webView != null) {
            webView.evaluateJavascript("window.onNativeScreenShareStopped && window.onNativeScreenShareStopped();", null);
        }
    }

    // --- Native audio capture (microphone + system/playback audio) ---
    private void startNativeAudioCapture() {
        if (isCapturingAudio) return;
        isCapturingAudio = true;

        startMicCapture();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && mediaProjection != null) {
            startPlaybackCapture();
        }
    }

    private AudioFormat buildCaptureFormat() {
        return new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(AUDIO_SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();
    }

    private int audioBufferSizeBytes() {
        int minBuf = AudioRecord.getMinBufferSize(
                AUDIO_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuf <= 0) minBuf = AUDIO_CHUNK_BYTES * 8;
        return Math.max(minBuf, AUDIO_CHUNK_BYTES * 4);
    }

    private void startMicCapture() {
        try {
            micAudioRecord = new AudioRecord.Builder()
                    .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                    .setAudioFormat(buildCaptureFormat())
                    .setBufferSizeInBytes(audioBufferSizeBytes())
                    .build();
            if (micAudioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                micAudioRecord.release();
                micAudioRecord = null;
                return;
            }
            micAudioRecord.startRecording();
            micAudioThread = new Thread(
                    () -> captureAudioLoop(micAudioRecord, "window.onNativeMicChunk", true),
                    "MicCaptureThread");
            micAudioThread.start();
        } catch (Exception e) {
            e.printStackTrace();
            micAudioRecord = null;
        }
    }

    private void startPlaybackCapture() {
        try {
            AudioPlaybackCaptureConfiguration captureConfig =
                    new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                            .addMatchingUsage(AudioAttributes.USAGE_GAME)
                            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                            .excludeUid(Process.myUid())
                            .build();

            playbackAudioRecord = new AudioRecord.Builder()
                    .setAudioFormat(buildCaptureFormat())
                    .setBufferSizeInBytes(audioBufferSizeBytes())
                    .setAudioPlaybackCaptureConfig(captureConfig)
                    .build();
            if (playbackAudioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                playbackAudioRecord.release();
                playbackAudioRecord = null;
                return;
            }
            playbackAudioRecord.startRecording();
            playbackAudioThread = new Thread(
                    () -> captureAudioLoop(playbackAudioRecord, "window.onNativePlaybackChunk", false),
                    "PlaybackCaptureThread");
            playbackAudioThread.start();
        } catch (Exception e) {
            e.printStackTrace();
            playbackAudioRecord = null;
        }
    }

    private void captureAudioLoop(AudioRecord record, String jsFunction, boolean micStream) {
        if (record == null) return;
        byte[] buffer = new byte[AUDIO_CHUNK_BYTES];
        while (isCapturingAudio) {
            int read;
            try {
                read = record.read(buffer, 0, buffer.length);
            } catch (Exception e) {
                break;
            }
            if (read <= 0) {
                if (read < 0) break;
                continue;
            }
            if (micStream && nativeMicMuted) {
                java.util.Arrays.fill(buffer, 0, read, (byte) 0);
            }
            final String base64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
            final String js = jsFunction + " && " + jsFunction + "('" + base64 + "');";
            runOnUiThread(() -> {
                if (isCapturingScreen && webView != null) {
                    webView.evaluateJavascript(js, null);
                }
            });
        }
    }

    private void stopNativeAudioCapture() {
        isCapturingAudio = false;

        // Stop records first to unblock any pending blocking read()
        stopAudioRecord(micAudioRecord);
        stopAudioRecord(playbackAudioRecord);

        joinThread(micAudioThread);
        joinThread(playbackAudioThread);
        micAudioThread = null;
        playbackAudioThread = null;
        micAudioRecord = null;
        playbackAudioRecord = null;
    }

    private void stopAudioRecord(AudioRecord record) {
        if (record == null) return;
        try {
            if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            record.release();
        } catch (Exception ignored) {
        }
    }

    private void joinThread(Thread thread) {
        if (thread == null) return;
        try {
            thread.join(600);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void startBackgroundThread() {
        if (backgroundThread == null) {
            backgroundThread = new HandlerThread("ScreenCaptureThread");
            backgroundThread.start();
            backgroundHandler = new Handler(backgroundThread.getLooper());
        }
    }

    private void stopBackgroundThread() {
        if (backgroundThread != null) {
            backgroundThread.quitSafely();
            try {
                backgroundThread.join();
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            backgroundThread = null;
            backgroundHandler = null;
        }
    }

    private void notifyJsScreenShareError(String errorMsg) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.onNativeScreenShareError && window.onNativeScreenShareError('" + errorMsg.replace("'", "\\'") + "');", null);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else if (requestCode == SCREEN_CAPTURE_REQ_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                try {
                    Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent);
                    } else {
                        startService(serviceIntent);
                    }

                    mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data);
                    if (mediaProjection != null) {
                        startScreenCapture();
                    } else {
                        notifyJsScreenShareError("Could not retrieve MediaProjection");
                    }
                } catch (Exception e) {
                    notifyJsScreenShareError("MediaProjection error: " + e.getMessage());
                }
            } else {
                notifyJsScreenShareError("Screen share permission denied");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Do NOT pause WebView during screen share/call, ensure timers continue
        if (webView != null) {
            webView.resumeTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
        }
    }

    @Override
    protected void onDestroy() {
        stopScreenCapture();
        if (sInstance == this) {
            sInstance = null;
        }
        if (audioManager != null && audioFocusRequest != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        }
        super.onDestroy();
    }
}

