package com.mentra.asg_client.di;

import android.content.Context;
import android.util.Log;

import com.mentra.asg_client.reporting.core.ReportManager;
import com.mentra.asg_client.reporting.providers.SentryReportProvider;
import com.mentra.asg_client.reporting.providers.ConsoleReportProvider;

/**
 * Dependency Injection module for reporting providers
 * Follows Dependency Inversion Principle - depends on abstractions
 * Follows Open/Closed Principle - easy to add new providers
 */
public class ReportingModule {

    private static final String TAG = "ReportingModule";


    public static void initialize(Context context) {
        Log.i(TAG, "Initializing reporting system...");

        ReportManager manager = ReportManager.getInstance(context);

        manager.addProvider(new SentryReportProvider());
        //Example: manager.addProvider(new CrashlyticsReportProvider());

        // Add Console provider for development debugging
        if (isDebugBuild()) {
            manager.addProvider(new ConsoleReportProvider());
        }

        Log.i(TAG, "Reporting system initialized successfully");
    }

    
    /**
     * Check if this is a debug build
     */
    private static boolean isDebugBuild() {
        try {
            // This will be true for debug builds, false for release
            return com.mentra.asg_client.BuildConfig.DEBUG;
        } catch (Exception e) {
            // Fallback to false if BuildConfig is not available
            return false;
        }
    }
} 