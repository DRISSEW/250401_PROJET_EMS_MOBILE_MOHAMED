package org.ems.myapps.barcodescanner;

import com.google.android.gms.vision.MultiProcessor;
import com.google.android.gms.vision.Tracker;
import com.google.android.gms.vision.barcode.Barcode;

/**
 * Factory for creating a tracker and associated graphic to be associated with a new barcode.  The
 * multi-processor uses this factory to create barcode trackers as needed -- one for each barcode.
 */
class BarcodeTrackerFactory implements MultiProcessor.Factory<Barcode> {
    private org.ems.myapps.barcodescanner.BarcodeGraphicTracker.Callback mCallback;

    BarcodeTrackerFactory(org.ems.myapps.barcodescanner.BarcodeGraphicTracker.Callback callback) {
        mCallback = callback;
    }

    @Override
    public Tracker<Barcode> create(Barcode barcode) {
        return new org.ems.myapps.barcodescanner.BarcodeGraphicTracker (mCallback);
    }

}
