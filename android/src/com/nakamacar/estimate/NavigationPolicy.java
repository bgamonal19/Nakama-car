package com.nakamacar.estimate;

import java.net.URI;

final class NavigationPolicy {
    static final String ORIGIN = "https://nakama-car-web-production.up.railway.app";
    static boolean isInternal(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                && "nakama-car-web-production.up.railway.app".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception invalid) { return false; }
    }
    static boolean isBlob(String value) { return value != null && value.startsWith("blob:" + ORIGIN + "/"); }
    static boolean isExternal(String value) {
        try {
            String scheme = new URI(value).getScheme();
            return "https".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme);
        } catch (Exception invalid) { return false; }
    }
}
