package org.ems.myapps;

import org.ems.myapps.myelectric.MyElectricSettings;

/**
 * Interface for things which want to know about changes to pages
 */
public interface PageChangeListener {

    void onAddPage(MyElectricSettings settings);

    void onDeletePage(MyElectricSettings settings);

    void onUpdatePage(MyElectricSettings settings);
}
