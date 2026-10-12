package com.nakamacar.estimate;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

/** Embedded, origin-restricted app surface. No browser toolbar or JavaScript bridge. */
public final class MainActivity extends Activity {
    private static final int PICK_FILES = 10, SAVE_PDF = 11, CHUNK = 131072, MAX_PDF = 16 * 1024 * 1024;
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingPdf;
    private boolean readingPdf;
    private String nativeScript = "";
    private boolean spanish() { return getResources().getConfiguration().getLocales().get(0).getLanguage().equals("es"); }
    private String text(String it, String es) { return spanish() ? es : it; }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(Color.rgb(11,35,58));
        getWindow().setNavigationBarColor(Color.rgb(11,35,58));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11,35,58));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                    android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                    return insets;
                }
            });
        } else root.setFitsSystemWindows(true);
        web = new WebView(this);
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        progress = new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        root.addView(progress,new FrameLayout.LayoutParams(-1,(int)(3*getResources().getDisplayMetrics().density)));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setBackgroundColor(Color.WHITE);
        int padding = (int)(24*getResources().getDisplayMetrics().density);
        errorPanel.setPadding(padding,padding,padding,padding);
        TextView message = new TextView(this);
        message.setText(text("Impossibile aprire NAKAMA CAR. Controlla la connessione e riprova.","No se pudo abrir NAKAMA CAR. Comprueba la conexión e inténtalo de nuevo."));
        message.setTextColor(Color.rgb(11,35,58));message.setTextSize(18);errorPanel.addView(message);
        Button retry = new Button(this);retry.setText(text("Riprova","Reintentar"));
        retry.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { errorPanel.setVisibility(View.GONE);web.reload(); } });
        errorPanel.addView(retry);root.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));errorPanel.setVisibility(View.GONE);
        setContentView(root);
        try (InputStream input = getAssets().open("native.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();byte[] buffer = new byte[4096];int n;
            while ((n=input.read(buffer))!=-1) bytes.write(buffer,0,n);
            nativeScript = new String(bytes.toByteArray(),StandardCharsets.UTF_8);
        } catch (Exception ignored) { }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString()+" NakamaAndroid/1.1.1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                if (!request.isForMainFrame()) return !NavigationPolicy.isInternal(request.getUrl().toString());
                String url=request.getUrl().toString();
                if ("nakama-download://pdf".equals(url)) { if (NavigationPolicy.isInternal(view.getUrl())) readPdf();return true; }
                if (NavigationPolicy.isBlob(url)) { captureBlob(url);return true; }
                if (NavigationPolicy.isInternal(url)) return false;
                if (NavigationPolicy.isExternal(url)) external(url);
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) {
                if (!NavigationPolicy.isInternal(url)) {
                    view.stopLoading();
                    if (NavigationPolicy.isExternal(url)) external(url);
                    view.loadUrl(NavigationPolicy.ORIGIN+"/");
                    return;
                }
                errorPanel.setVisibility(View.GONE);progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view,String url) {
                progress.setVisibility(View.GONE);CookieManager.getInstance().flush();
                if (NavigationPolicy.isInternal(url)) view.evaluateJavascript(nativeScript,null);
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) { if (request.isForMainFrame()) showError(); }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) { if (request.isForMainFrame()) showError(); }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error) { handler.cancel();showError(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int value) { progress.setProgress(value);if(value==100)progress.setVisibility(View.GONE); }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if (!NavigationPolicy.isInternal(view.getUrl())) return false;
                if (fileCallback!=null) fileCallback.onReceiveValue(null);
                fileCallback=callback;
                try { startActivityForResult(params.createIntent(),PICK_FILES); }
                catch (ActivityNotFoundException unavailable) { fileCallback.onReceiveValue(null);fileCallback=null;toast(text("Selettore file non disponibile","Selector de archivos no disponible")); }
                return true;
            }
            @Override public boolean onJsAlert(WebView view,String url,String message,final JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("NAKAMA CAR").setMessage(message)
                    .setPositiveButton("OK",new android.content.DialogInterface.OnClickListener(){public void onClick(android.content.DialogInterface d,int w){result.confirm();}})
                    .setOnCancelListener(new android.content.DialogInterface.OnCancelListener(){public void onCancel(android.content.DialogInterface d){result.cancel();}}).show();return true;
            }
            @Override public boolean onJsConfirm(WebView view,String url,String message,final JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("NAKAMA CAR").setMessage(message)
                    .setPositiveButton("OK",new android.content.DialogInterface.OnClickListener(){public void onClick(android.content.DialogInterface d,int w){result.confirm();}})
                    .setNegativeButton(text("Annulla","Cancelar"),new android.content.DialogInterface.OnClickListener(){public void onClick(android.content.DialogInterface d,int w){result.cancel();}})
                    .setOnCancelListener(new android.content.DialogInterface.OnCancelListener(){public void onCancel(android.content.DialogInterface d){result.cancel();}}).show();return true;
            }
            @Override public boolean onJsPrompt(WebView view,String url,String message,String initial,final JsPromptResult result) {
                final EditText input=new EditText(MainActivity.this);input.setText(initial);
                new AlertDialog.Builder(MainActivity.this).setTitle("NAKAMA CAR").setMessage(message).setView(input)
                    .setPositiveButton("OK",new android.content.DialogInterface.OnClickListener(){public void onClick(android.content.DialogInterface d,int w){result.confirm(input.getText().toString());}})
                    .setNegativeButton(text("Annulla","Cancelar"),new android.content.DialogInterface.OnClickListener(){public void onClick(android.content.DialogInterface d,int w){result.cancel();}})
                    .setOnCancelListener(new android.content.DialogInterface.OnCancelListener(){public void onCancel(android.content.DialogInterface d){result.cancel();}}).show();return true;
            }
        });
        web.setDownloadListener(new DownloadListener(){@Override public void onDownloadStart(String url,String agent,String disposition,String type,long length){
            if(NavigationPolicy.isBlob(url))captureBlob(url);else if(NavigationPolicy.isExternal(url))external(url);
        }});
        if(saved==null||web.restoreState(saved)==null)web.loadUrl(NavigationPolicy.ORIGIN+"/");
    }
    private void captureBlob(String url) {
        if(NavigationPolicy.isInternal(web.getUrl())&&NavigationPolicy.isBlob(url))web.evaluateJavascript(nativeScript+";window.__nakamaReadBlob && window.__nakamaReadBlob("+JSONObject.quote(url)+")",null);
    }
    private void readPdf() {
        if(readingPdf||pendingPdf!=null)return;readingPdf=true;
        web.evaluateJavascript("JSON.stringify(window.__nakamaPendingPdf ? {length:window.__nakamaPendingPdf.data.length} : null)",new ValueCallback<String>(){
            @Override public void onReceiveValue(String value){
                try {
                    String json=(String)new JSONTokener(value).nextValue();int length=new JSONObject(json).getInt("length");
                    if(length<=0||length>((MAX_PDF+2)/3)*4||length%4!=0)throw new Exception();
                    readChunk(0,length,new ByteArrayOutputStream());
                } catch(Exception invalid){pdfFailed();}
            }
        });
    }
    private void readChunk(final int offset,final int total,final ByteArrayOutputStream output) {
        if(!NavigationPolicy.isInternal(web.getUrl())){pdfFailed();return;}
        final int end=Math.min(offset+CHUNK,total);
        web.evaluateJavascript("window.__nakamaPendingPdf && window.__nakamaPendingPdf.data.slice("+offset+","+end+")",new ValueCallback<String>(){
            @Override public void onReceiveValue(String value){
                try {
                    String part=(String)new JSONTokener(value).nextValue();if(part.length()!=end-offset)throw new Exception();
                    byte[] bytes=Base64.decode(part,Base64.DEFAULT);output.write(bytes);
                    if(output.size()>MAX_PDF)throw new Exception();
                    if(end<total){readChunk(end,total,output);return;}
                    byte[] pdf=output.toByteArray();
                    if(pdf.length<5||pdf[0]!='%'||pdf[1]!='P'||pdf[2]!='D'||pdf[3]!='F'||pdf[4]!='-')throw new Exception();
                    pendingPdf=pdf;readingPdf=false;clearPdfScript();
                    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);
                    save.setType("application/pdf");save.putExtra(Intent.EXTRA_TITLE,"NAKAMA-CAR.pdf");startActivityForResult(save,SAVE_PDF);
                }catch(Exception invalid){pdfFailed();}
            }
        });
    }
    private void clearPdfScript(){web.evaluateJavascript("window.__nakamaPendingPdf=null;window.__nakamaPdfBusy=false;",null);}
    private void pdfFailed(){readingPdf=false;pendingPdf=null;clearPdfScript();toast(text("Impossibile salvare il PDF. Riprova.","No se pudo guardar el PDF. Inténtalo de nuevo."));}
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILES&&fileCallback!=null){
            Uri[] chosen=WebChromeClient.FileChooserParams.parseResult(result,data);ArrayList<Uri> safe=new ArrayList<>();
            if(chosen!=null)for(Uri uri:chosen)if(uri!=null&&"content".equals(uri.getScheme())&&safe.size()<30)safe.add(uri);
            fileCallback.onReceiveValue(safe.isEmpty()?null:safe.toArray(new Uri[0]));fileCallback=null;
        }
        if(request==SAVE_PDF){
            final byte[] pdf=pendingPdf;pendingPdf=null;
            if(result!=RESULT_OK||data==null||data.getData()==null||pdf==null)return;
            final Uri target=data.getData();
            if(!"content".equals(target.getScheme()))return;
            new Thread(new Runnable(){@Override public void run(){
                try(OutputStream output=getContentResolver().openOutputStream(target,"w")){
                    if(output==null)throw new Exception();output.write(pdf);
                    runOnUiThread(new Runnable(){public void run(){toast(text("PDF salvato","PDF guardado"));}});
                }catch(Exception error){runOnUiThread(new Runnable(){public void run(){toast(text("Salvataggio PDF non riuscito","No se pudo guardar el PDF"));}});}
            }}).start();
        }
    }
    private void external(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException ignored){toast(text("Nessuna app disponibile","No hay una aplicación disponible"));}}
    private void showError(){progress.setVisibility(View.GONE);errorPanel.setVisibility(View.VISIBLE);}
    private void toast(String value){Toast.makeText(this,value,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){if(web.canGoBack()){errorPanel.setVisibility(View.GONE);web.goBack();}else super.onBackPressed();}
    @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
    @Override protected void onPause(){CookieManager.getInstance().flush();web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}pendingPdf=null;web.destroy();super.onDestroy();}
}
