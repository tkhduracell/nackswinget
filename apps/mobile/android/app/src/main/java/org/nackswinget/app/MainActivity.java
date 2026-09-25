package org.nackswinget.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Matches --ion-color-dark used by the app header
    private static final int HEADER_COLOR = Color.parseColor("#222428");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Opt in explicitly so pre-35 devices get the same edge-to-edge layout
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // targetSdk 35+ enforces edge-to-edge. Keep the WebView out from under the
        // system bars: pad top with header color, bottom with tab bar color.
        View content = findViewById(android.R.id.content);
        View webViewParent = (View) getBridge().getWebView().getParent();
        content.setBackgroundColor(HEADER_COLOR);
        webViewParent.setBackgroundColor(Color.WHITE);

        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, 0);
            webViewParent.setPadding(0, 0, 0, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(true);
    }
}
