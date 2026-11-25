package et.edu.burkaharbu.exam;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
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
    static final String OFFLINE_BASE = "https://offline.bhsss.local/";
    static final String OFFLINE_HTML =
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>"
        + "<style>"
        + "*{box-sizing:border-box;margin:0;padding:0}"
        + "body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;"
        + "background:radial-gradient(circle at 50% 0%,#162447 0%,#0c1222 65%);color:#f1f5f9;"
        + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center}"
        + ".card{width:100%;max-width:360px;background:rgba(19,29,52,.88);border:1px solid rgba(56,189,248,.22);"
        + "border-radius:22px;padding:32px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}"
        + ".icon{width:68px;height:68px;margin:0 auto 18px;border-radius:50%;display:flex;align-items:center;"
        + "justify-content:center;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4)}"
        + "h1{font-size:21px;font-weight:700;letter-spacing:-.01em;margin-bottom:10px}"
        + "p{font-size:14px;line-height:1.55;color:#94a3b8;margin-bottom:18px}"
        + ".badge{font-size:11px;color:#7dd3fc;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.2);"
        + "border-radius:999px;padding:6px 12px;display:inline-block;margin-bottom:20px}"
        + "button{width:100%;border:0;border-radius:12px;padding:13px 18px;font-size:15px;font-weight:600;"
        + "background:#38bdf8;color:#082f49;cursor:pointer;box-shadow:0 0 24px rgba(56,189,248,.28)}"
        + "button:active{transform:scale(.98);opacity:.9}"
        + "#note{margin-top:12px;font-size:12px;color:#fbbf24;min-height:16px}"
        + "</style></head><body><div class='card'>"
        + "<div class='icon'><svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#f59e0b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>"
        + "<line x1='2' y1='2' x2='22' y2='22'/><path d='M8.5 16.5a5 5 0 0 1 7 0'/>"
        + "<path d='M2 8.82a15 15 0 0 1 4.17-2.65'/><path d='M10.66 5c4.01-.36 8.14.9 11.34 3.76'/>"
        + "<path d='M16.85 11.25a10 10 0 0 1 2.22 1.68'/><path d='M5 13a10 10 0 0 1 5.24-2.76'/>"
        + "<line x1='12' y1='20' x2='12.01' y2='20'/></svg></div>"
        + "<h1>No Internet Connection</h1>"
        + "<p>You are offline right now. Turn on Wi-Fi or mobile data, then tap Try again to open the exam portal.</p>"
        + "<div class='badge'>Burka Harbu Special Secondary School</div>"
        + "<button id='btn' onclick='retry()'>Try again</button>"
        + "<div id='note'></div>"
        + "</div><script>"
        + "function retry(){var b=document.getElementById('btn'),n=document.getElementById('note');"
        + "b.textContent='Checking connection...';n.textContent='';"
        + "if(window.BHExamApp&&BHExamApp.retry)BHExamApp.retry();}"
        + "window.__stillOffline=function(){document.getElementById('btn').textContent='Try again';"
        + "document.getElementById('note').textContent='Still offline - check Wi-Fi or mobile data.';};"
        + "</script></body></html>";
    WebView web;
    boolean examRunning = false;
    String lastUrl = PORTAL;

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
        s.setUserAgentString(s.getUserAgentString() + " BHSSSExamApp/1.2");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    String failed = req.getUrl() != null ? req.getUrl().toString() : PORTAL;
                    showOffline(failed);
                }
            }
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView view, int code, String desc, String failingUrl) {
                showOffline(failingUrl);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(new Runnable() { public void run() { r.grant(r.getResources()); } });
            }
        });
        web.addJavascriptInterface(new Bridge(), "BHExamApp");
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
        }
        if (saved != null) {
            web.restoreState(saved);
        } else if (hasInternet()) {
            web.loadUrl(PORTAL);
        } else {
            showOffline(PORTAL);
        }
    }

    boolean hasInternet() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            Network net = cm.getActiveNetwork();
            if (net == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(net);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return true;
        }
    }

    void showOffline(String url) {
        if (url != null && url.startsWith("https://") && !url.startsWith(OFFLINE_BASE)) {
            lastUrl = url;
        }
        web.stopLoading();
        web.loadDataWithBaseURL(OFFLINE_BASE, OFFLINE_HTML, "text/html", "UTF-8", null);
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
        @JavascriptInterface public void retry() {
            runOnUiThread(new Runnable() { public void run() {
                if (hasInternet()) {
                    web.loadUrl(lastUrl);
                } else {
                    web.evaluateJavascript("window.__stillOffline&&window.__stillOffline()", null);
                }
            } });
        }
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
