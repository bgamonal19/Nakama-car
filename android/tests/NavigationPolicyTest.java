package com.nakamacar.estimate;
public class NavigationPolicyTest {
    public static void main(String[] args) {
        String host=NavigationPolicy.ORIGIN;
        for(String url:new String[]{host,host+"/clienti?query=1#details",host+":443/login"})
            check(NavigationPolicy.isInternal(url),"internal "+url);
        for(String url:new String[]{null,"",host+".evil.test",host+"@evil.test",host+":444/","http://nakama-car-web-production.up.railway.app","javascript:alert(1)","file:///secret","content://private", "https://user@nakama-car-web-production.up.railway.app"})
            check(!NavigationPolicy.isInternal(url),"reject "+url);
        check(NavigationPolicy.isBlob("blob:"+host+"/uuid"),"own blob");
        check(!NavigationPolicy.isBlob("blob:"+host+".evil.test/uuid"),"foreign blob");
        for(String url:new String[]{"https://example.com","tel:+39000","mailto:info@example.com"})check(NavigationPolicy.isExternal(url),"external");
        for(String url:new String[]{null,"http://example.com","intent://app","file:///a","javascript:alert(1)","content://a"})check(!NavigationPolicy.isExternal(url),"unsafe external");
        System.out.println("Navigation policy: 24 checks passed");
    }
    static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
}
