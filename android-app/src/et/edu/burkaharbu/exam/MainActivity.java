package et.edu.burkaharbu.exam;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Burka Harbu Grade 12 exam app: opens the exam portal with screenshots and screen recording
 * blocked (FLAG_SECURE). While an exam is running the portal calls BHExamApp.lock(), which pins
 * the app (no home, recent apps, notifications, split screen or floating AI apps) until unlock().
 */
public class MainActivity extends Activity {
    static final String PORTAL = "https://bhsss-exam-portal.vercel.app/student";
    WebView web;
    boolean examRunning = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(12, 18, 34));
        setContentView(web);
        immersive();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " BHSSSExamApp/1.0");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(new Runnable() { public void run() { r.grant(r.getResources()); } });
            }
        });
        web.addJavascriptInterface(new Bridge(), "BHExamApp");
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
        }
        if (saved != null) web.restoreState(saved); else web.loadUrl(PORTAL);
    }

    class Bridge {
        @JavascriptInterface public void lock() {
            runOnUiThread(new Runnable() { public void run() {
                examRunning = true;
                try { startLockTask(); } catch (Exception ignored) { }
                immersive();
            } });
        }
        @JavascriptInterface public void unlock() {
            runOnUiThread(new Runnable() { public void run() {
                examRunning = false;
                try { stopLockTask(); } catch (Exception ignored) { }
            } });
        }
        @JavascriptInterface public boolean isApp() { return true; }
    }

    void immersive() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override public void onBackPressed() {
        if (examRunning) return; // the back button does nothing during an exam
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
