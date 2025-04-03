package org.ems.myapps.myelectric;

import android.os.Parcel;
import android.os.Parcelable;
import android.widget.Spinner;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Holds the details of a MyElectric instance
 */
public class MyElectricSettings implements Parcelable {

    private int id;
    private String name;
    private int powerFeedId;
    private int useFeedId;
    private String unitCost;
    private String costSymbol;
    private String powerScale;
    private String customCurrencySymbol;
    private float powerScaleFloat;
    private float unitCostFloat;
    private boolean deleted = false;
    private String Grandeurs_physique_param;
    private String Grandeur_unite_autreSymbol;
    private String Grandeur_name_autreSymbol;


    public static final Parcelable.Creator CREATOR = new Parcelable.Creator() {
        public MyElectricSettings createFromParcel(Parcel in) {
            return new MyElectricSettings(in);
        }
        public MyElectricSettings[] newArray(int size) {
            return new MyElectricSettings[size];
        }
    };

    public static MyElectricSettings fromJson(int id, JSONObject jsonObject) throws JSONException {

        String customCurrencySymbol = "";
        if (jsonObject.has("customCurrencySymbol")) {
            customCurrencySymbol = jsonObject.getString("customCurrencySymbol");
        }

        String Grandeur_name_autreSymbol = "";

        if (jsonObject.has("Grandeur_name_autreSymbol")) {
            Grandeur_name_autreSymbol = jsonObject.getString("Grandeur_name_autreSymbol");
        }

        String Grandeur_unite_autreSymbol = "";

        if (jsonObject.has("Grandeur_unite_autreSymbol")) {
            Grandeur_unite_autreSymbol = jsonObject.getString("Grandeur_unite_autreSymbol");
        }

        return new MyElectricSettings(id, jsonObject.getString("name"),jsonObject.getString("Grandeurs_physique_param"),
                Grandeur_name_autreSymbol,
                Grandeur_unite_autreSymbol,
                jsonObject.getInt("powerFeedId"),
                jsonObject.getInt("useFeedId"),
                jsonObject.getString("powerScale"),
                jsonObject.getString("unitCost"),
                jsonObject.getString("costSymbol"),
                customCurrencySymbol);
    }

    public MyElectricSettings(int id, String name, String Grandeurs_physique_param,String Grandeur_name_autreSymbol,String Grandeur_unite_autreSymbol ,  int powerFeedId, int useFeedId, String powerScale, String unitCost, String costSymbol, String customCurrencySymbol) {
        this.id = id;
        this.name = name;
        this.Grandeurs_physique_param = Grandeurs_physique_param;
        this.Grandeur_name_autreSymbol = Grandeur_name_autreSymbol;
        this.Grandeur_unite_autreSymbol = Grandeur_unite_autreSymbol;
        this.powerFeedId = powerFeedId;
        this.useFeedId = useFeedId;
        this.unitCost = unitCost;
        this.costSymbol = costSymbol;
        this.powerScale = powerScale;
        this.powerScaleFloat = stringToFloat(powerScale);
        this.unitCostFloat = stringToFloat(unitCost);
        this.customCurrencySymbol = customCurrencySymbol;

    }

    public MyElectricSettings(Parcel in) {
        this.id = in.readInt();
        this.name = in.readString();
        this.Grandeurs_physique_param = in.readString();
        this.Grandeur_name_autreSymbol = in.readString();
        this.Grandeur_unite_autreSymbol = in.readString();
        this.powerFeedId = in.readInt();
        this.useFeedId = in.readInt();
        this.powerScale = in.readString();
        this.unitCost = in.readString();
        this.costSymbol = in.readString();
        this.customCurrencySymbol = in.readString();
        this.powerScaleFloat = stringToFloat(powerScale);
        this.unitCostFloat = stringToFloat(unitCost);

    }


    public String getGrandeurs_physiques() {
        return Grandeurs_physique_param;
    }
    public String getGrandeur_unite_autreSymbol() {return Grandeur_unite_autreSymbol;}
    public String getGrandeur_name_autreSymbol() {
        return Grandeur_name_autreSymbol;
    }

    public void setGrandeurs_physique_param(String Grandeurs_physique_param) {
        this.Grandeurs_physique_param = Grandeurs_physique_param;
    }

    public void setGrandeur_unite_autreSymbol(String Grandeur_unite_autreSymbol) {
        this.Grandeur_unite_autreSymbol = Grandeur_unite_autreSymbol;
    }

    public void setGrandeur_name_autreSymbol(String Grandeur_name_autreSymbol) {
        this.Grandeur_name_autreSymbol = Grandeur_name_autreSymbol;
    }
    public void setDeleted() {
        deleted = true;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public int getPowerFeedId() {
        return powerFeedId;
    }

    public int getUseFeedId() {
        return useFeedId;
    }

    public String getPowerScale() {
        return powerScale;
    }

    public float getPowerScaleAsFloat() {
        return powerScaleFloat;
    }

    public void setPowerScale(String powerScale) {
        this.powerScale = powerScale;
        this.powerScaleFloat = stringToFloat(powerScale);
    }

    public String getUnitCost() {
        return unitCost;
    }

    public String getCostSymbol() {
        return costSymbol;
    }

    public String getCustomCurrencySymbol() {
        return customCurrencySymbol;
    }

    public void setUseFeedId(int useFeedId) {
        this.useFeedId = useFeedId;
    }

    public void setPowerFeedId(int powerFeedId) {
        this.powerFeedId = powerFeedId;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setCostSymbol(String costSymbol) {
        this.costSymbol = costSymbol;
    }

    public void setCustomCurrencySymbol(String customCurrencySymbol) {
        this.customCurrencySymbol = customCurrencySymbol;
    }

    public void setUnitCost(String unitCost) {

        this.unitCost = unitCost;
        this.unitCostFloat = stringToFloat(unitCost);

    }

    public float getUnitCostFloat() {
        return unitCostFloat;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel parcel, int i) {
        parcel.writeInt(id);
        parcel.writeString(name);
        parcel.writeString(Grandeurs_physique_param);
        parcel.writeString(Grandeur_name_autreSymbol);
        parcel.writeString(Grandeur_unite_autreSymbol);
        parcel.writeInt(powerFeedId);
        parcel.writeInt(useFeedId);
        parcel.writeString(powerScale);
        parcel.writeString(unitCost);
        parcel.writeString(costSymbol);
        parcel.writeString(customCurrencySymbol);

    }

    public String toJson() throws Exception {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("name",name);
        jsonObject.put("Grandeurs_physique_param",Grandeurs_physique_param);
        jsonObject.put("Grandeur_name_autreSymbol",Grandeur_name_autreSymbol);
        jsonObject.put("Grandeur_unite_autreSymbol",Grandeur_unite_autreSymbol);
        jsonObject.put("powerFeedId",powerFeedId);
        jsonObject.put("useFeedId",useFeedId);
        jsonObject.put("powerScale",powerScale);
        jsonObject.put("unitCost",unitCost);
        jsonObject.put("costSymbol",costSymbol);
        jsonObject.put("customCurrencySymbol",customCurrencySymbol);


        return jsonObject.toString();
    }

    public String toString() {
        return name + ", power: " + powerFeedId + ", use: " + useFeedId;
    }

    private float stringToFloat(String val) {
        try {
            return Float.parseFloat(val);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }
}
