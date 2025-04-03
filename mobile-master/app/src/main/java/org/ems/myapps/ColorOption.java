package org.ems.myapps;

public class ColorOption {
    private String colorName;
    private int iconResId;

    public ColorOption(String colorName, int iconResId) {
        this.colorName = colorName;
        this.iconResId = iconResId;
    }

    public String getColorName() {
        return colorName;
    }

    public int getIconResId() {
        return iconResId;
    }
}

