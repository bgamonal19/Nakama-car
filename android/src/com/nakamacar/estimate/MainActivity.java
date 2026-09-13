package com.nakamacar.estimate;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Opens the live application using the browser's secure Custom Tab implementation.
 * The browser owns authentication, uploads, camera selection and PDF downloads.
 * There is no native Javascript bridge, local credential copy or offline database.
 */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://nakama-car-web-production.up.railway.app/";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        launchApplication();
    }

    private void launchApplication() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(APP_URL));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        Bundle customTab = new Bundle();
        // An explicit null session requests a Custom Tab without binding a service.
        customTab.putBinder("android.support.customtabs.extra.SESSION", null);
        intent.putExtras(customTab);
        intent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", Color.rgb(11,35,58));
        intent.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        try {
            startActivity(intent);
            finish();
        } catch (ActivityNotFoundException unavailable) {
            showBrowserRequired();
        }
    }

    private void showBrowserRequired() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(24 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding,padding,padding,padding);
        TextView text = new TextView(this);
        boolean spanish = getResources().getConfiguration().getLocales().get(0).getLanguage().equals("es");
        text.setText(spanish ? "NAKAMA CAR\n\nNecesitas un navegador como Chrome para abrir la aplicación."
                : "NAKAMA CAR\n\nInstalla un browser come Chrome per aprire l’applicazione.");
        text.setTextSize(18);
        layout.addView(text);
        Button retry = new Button(this);
        retry.setText(spanish ? "Volver a intentar" : "Riprova");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { launchApplication(); }
        });
        layout.addView(retry);
        setContentView(layout);
    }
}
