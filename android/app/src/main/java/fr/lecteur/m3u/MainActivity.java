package fr.lecteur.m3u;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Blasto TV pour Google TV : affiche le lecteur servi par le Mac, pilotable à la télécommande. */
public class MainActivity extends Activity {
    private static final String DEFAULT_URL = "http://192.168.1.95:8080";
    private WebView web;
    private FrameLayout root;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("lecteur", MODE_PRIVATE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0B0D"));
        setContentView(root);
        String url = prefs.getString("url", null);
        if (url == null) showSetup(null); else showWeb(url);
    }

    private void showWeb(String url) {
        root.removeAllViews();
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0B0D"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " LecteurTV/1.0");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showSetup("Impossible de joindre le lecteur. Vérifiez que le Mac est allumé et que le lecteur est lancé.");
            }
        });
        web.setFocusable(true);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(url);
        web.requestFocus();
    }

    private void showSetup(String error) {
        root.removeAllViews();
        if (web != null) { web.destroy(); web = null; }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(80, 40, 80, 40);
        TextView title = new TextView(this);
        title.setText("Blasto TV");
        title.setTextSize(30);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        box.addView(title);
        TextView info = new TextView(this);
        info.setText(error != null ? error : "Adresse du lecteur (affichée dans le Terminal du Mac) :");
        info.setTextSize(18);
        info.setTextColor(error != null ? Color.parseColor("#FF8A8A") : Color.parseColor("#9AA1AE"));
        info.setGravity(Gravity.CENTER);
        info.setPadding(0, 24, 0, 16);
        box.addView(info);
        final EditText input = new EditText(this);
        input.setText(prefs.getString("url", DEFAULT_URL));
        input.setTextSize(22);
        input.setTextColor(Color.WHITE);
        input.setSingleLine(true);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setMinWidth(700);
        box.addView(input);
        Button go = new Button(this);
        go.setText(error != null ? "Réessayer" : "Ouvrir le lecteur");
        go.setTextSize(20);
        box.addView(go);
        View.OnClickListener open = v -> {
            String u = input.getText().toString().trim();
            if (!u.startsWith("http")) u = "http://" + u;
            Uri parsed = Uri.parse(u);
            if (parsed.getHost() == null) return;
            prefs.edit().putString("url", u).apply();
            showWeb(u);
        };
        go.setOnClickListener(open);
        input.setOnEditorActionListener((v, id, ev) -> { open.onClick(v); return true; });
        root.addView(box, new FrameLayout.LayoutParams(-1, -1));
        go.requestFocus();
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent ev) {
        // Retour : ferme la vidéo / revient en arrière dans le lecteur, sinon quitte
        if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) { web.goBack(); return true; }
        // Touche Menu : changer l'adresse du lecteur
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) { showSetup(null); return true; }
        return super.onKeyDown(code, ev);
    }

    @Override
    protected void onPause() { super.onPause(); if (web != null) web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
}
