package org.ems.myapps.chart;

import com.github.mikephil.charting.components.AxisBase;
import com.github.mikephil.charting.formatter.IAxisValueFormatter;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;

public class DaysXAsisValueFormatter implements IAxisValueFormatter {
    private ArrayList<String> labels;

    public DaysXAsisValueFormatter(ArrayList<String> labels) {
        this.labels = labels;
    }
    @Override
    public String getFormattedValue(float value, AxisBase axis) {
        if (value >= labels.size()) {
            return "";
        }
        DateFormat df = new SimpleDateFormat("EEE", Locale.ENGLISH);
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(Long.parseLong(labels.get((int) value)));
        return (df.format(cal.getTime()));
    }
}

