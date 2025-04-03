package org.ems.myapps;

import android.app.Fragment;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;

import android.support.v7.app.ActionBar;
import android.support.v7.app.AlertDialog;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import com.android.volley.Response;
import com.android.volley.VolleyError;
import com.android.volley.toolbox.JsonArrayRequest;

import org.ems.myapps.db.EmonDatabaseHelper;
import org.ems.myapps.myelectric.MyElectricSettings;
import org.ems.myapps.settings.FeedSpinnerAdapter;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Fragment for setting the feed settings for the account
 */
public class MyElectricSettingsFragment extends Fragment {
    static final String TAG = "MESETTINGSFRAGMENT";

    private String emoncmsProtocol;
    private String emoncmsURL;
    private String emoncmsAPIKEY;
    Spinner powerFeedPreference;
    Spinner spinner;
    Spinner kWhFeedPreference;
    EditText namePreference;
    Spinner currencyPreference;
    Spinner scalePreference;
    EditText unitCostPreference;
    EditText customCurrencyPreference;
    EditText Grandeur_name_autrePreference;
    EditText Grandeur_unite_autrePreference;
    Handler mHandler = new Handler();
    SharedPreferences sp;
    private TextView txtPowerUnits;
    private TextView txtUseTodayUnits;

    private String[] powerValueArray;
    private String[] costSymbolArray;
    private String[] Grandeurs_physiques_Array;
    private MyElectricSettings settings;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        settings = getArguments().getParcelable("settings");
        sp = EmonApplication.get().getSharedPreferences(EmonApplication.get().getCurrentAccount());

    }

    @Override
    public View onCreateView(LayoutInflater inflater,
                             ViewGroup container,
                             Bundle savedInstanceState) {
        View result=inflater.inflate(R.layout.page_settings, container, false);
        powerFeedPreference = (Spinner) result.findViewById(R.id.powerFeedSpinner);
        kWhFeedPreference = (Spinner) result.findViewById(R.id.useFeedSpinner);
        scalePreference = (Spinner) result.findViewById(R.id.escaleSpinner);
        spinner = (Spinner) result.findViewById(R.id.Grandeurs_physiques);

        ArrayAdapter<CharSequence> scaleArray = ArrayAdapter.createFromResource(result.getContext(),R.array.escale_text, R.layout.support_simple_spinner_dropdown_item);
        scalePreference.setAdapter(scaleArray);
        scalePreference.setSelection(scaleValueToIndex(settings.getPowerScale()));

        ArrayAdapter<CharSequence> adapter = ArrayAdapter.createFromResource(result.getContext(), R.array.Grandeurs_physiques, R.layout.support_simple_spinner_dropdown_item );
        adapter.setDropDownViewResource(R.layout.support_simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setSelection(Grandeur_phy_SymbolToIndex(settings.getGrandeurs_physiques()));

        namePreference = (EditText) result.findViewById(R.id.page_name);
        currencyPreference = (Spinner) result.findViewById(R.id.currency);
        unitCostPreference = (EditText) result.findViewById(R.id.costUnit);
        customCurrencyPreference = (EditText) result.findViewById(R.id.customCurrency);
        Grandeur_name_autrePreference = (EditText) result.findViewById(R.id.Grandeurs_physiques_name_input);
        Grandeur_unite_autrePreference = (EditText) result.findViewById(R.id.Grandeurs_physiques_unit_input);

        ArrayAdapter<CharSequence> costUnitArray = ArrayAdapter.createFromResource(result.getContext(),R.array.me_cost_text, R.layout.support_simple_spinner_dropdown_item);
        currencyPreference.setAdapter(costUnitArray);
        currencyPreference.setSelection(costSymbolToIndex(settings.getCostSymbol()));

        unitCostPreference.setText(""+settings.getUnitCost());

        customCurrencyPreference.setText(settings.getCustomCurrencySymbol());
        Grandeur_unite_autrePreference.setText(settings.getGrandeur_unite_autreSymbol());
        Grandeur_name_autrePreference.setText(settings.getGrandeur_name_autreSymbol());

        namePreference.setText(settings.getName());
        return(result);
    }

    @Override
    public void onResume() {
        super.onResume();
        loadValues();
        updateFeedList();
    }



    private int scaleValueToIndex(String symbol) {
        if (powerValueArray == null) {
            powerValueArray = getActivity().getResources().getStringArray(R.array.escale_values);
        }

        for (int i = 0; i < powerValueArray.length; i++) {
            if (powerValueArray[i].equals(symbol)) {
                return i;
            }
        }
        return 0;
    }

    private int Grandeur_phy_SymbolToIndex(String symbol) {
        if (Grandeurs_physiques_Array == null) {
            Grandeurs_physiques_Array = getActivity().getResources().getStringArray(R.array.Grandeurs_physiques);
        }
        for (int i = 0; i < Grandeurs_physiques_Array.length; i++) {
            if (Grandeurs_physiques_Array[i].equals(symbol)) {
                return i;
            }
        }
        return 0;
    }

    private int costSymbolToIndex(String symbol) {
        if (costSymbolArray == null) {
            costSymbolArray = getActivity().getResources().getStringArray(R.array.me_cost_values);
        }

        for (int i = 0; i < costSymbolArray.length; i++) {
            if (costSymbolArray[i].equals(symbol)) {
                return i;
            }
        }
        return 0;
    }

    @Override
    public void onActivityCreated(Bundle savesInstanceState) {
        super.onActivityCreated(savesInstanceState);

        ActionBar actionBar = ((AppCompatActivity) getActivity()).getSupportActionBar();
        if (actionBar != null) actionBar.setTitle(R.string.me_settings_title);

        costSymbolArray = getActivity().getResources().getStringArray(R.array.me_cost_values);
    }



    @Override
    public void onPause() {
        savePage();

        super.onPause();
        HTTPClient.getInstance(getActivity()).cancellAll(TAG);
        mHandler.removeCallbacksAndMessages(null);
    }

    private void savePage() {

        if (!settings.isDeleted()) {

            Log.d("emon-settings", "Saving Page");

            settings.setPowerFeedId((int) powerFeedPreference.getSelectedItemId());
            settings.setUseFeedId((int) kWhFeedPreference.getSelectedItemId());
            settings.setName(namePreference.getText().toString());
            settings.setUnitCost(unitCostPreference.getText().toString());

            String[] Grandeurs_physique_paramArray = getActivity().getResources().getStringArray(R.array.Grandeurs_physiques);
            String Grandeurs_physique_param = Grandeurs_physique_paramArray[spinner.getSelectedItemPosition()];
            settings.setGrandeurs_physique_param(Grandeurs_physique_param);

            String[] scaleArray = getActivity().getResources().getStringArray(R.array.escale_values);
            String scaleValue = scaleArray[scalePreference.getSelectedItemPosition()];
            settings.setPowerScale(scaleValue);

            String[] symbolArray = getActivity().getResources().getStringArray(R.array.me_cost_values);

            String currencySymbol = symbolArray[currencyPreference.getSelectedItemPosition()];

            settings.setCostSymbol(currencySymbol);
            settings.setCustomCurrencySymbol(customCurrencyPreference.getText().toString());
            settings.setGrandeur_unite_autreSymbol(Grandeur_unite_autrePreference.getText().toString());
            settings.setGrandeur_name_autreSymbol(Grandeur_name_autrePreference.getText().toString());

            Log.w("settings", "Setting Cost Symbol to " + currencySymbol);
//            Log.w("settings", "Setting Grandeur_phisique Symbol to " + Grandeurs_physique_param);


            if (settings.getId() == 0) {
                //FIXME probably move database access into EmonApplication
                Log.d("settings", "Inserting");
                int id = EmonDatabaseHelper.getInstance(getActivity()).addPage(EmonApplication.get().getCurrentAccount(), settings);
                settings.setId(id);
                EmonApplication.get().addPage(settings);
            } else {
                Log.d("settings", "Updating");
                EmonDatabaseHelper.getInstance(getActivity()).updatePage(settings.getId(), settings);
                EmonApplication.get().updatePage(settings);
            }
        }
    }


    void loadValues() {
        emoncmsProtocol = sp.getBoolean("emoncms_usessl", false) ? "https://" : "http://";
        emoncmsURL = sp.getString("emoncms_url", "");
        emoncmsAPIKEY = sp.getString("emoncms_apikey", "");

        Log.d("PREF URL", emoncmsURL);
    }

    private void updateFeedList() {
        if (!emoncmsURL.equals("") && !emoncmsAPIKEY.equals(""))
            mHandler.post(runnableFeedLoader);
    }

    private Runnable runnableFeedLoader = new Runnable() {

        @Override
        public void run() {
            String url = String.format("%s%s/feed/list.json?apikey=%s", emoncmsProtocol, emoncmsURL, emoncmsAPIKEY);

            JsonArrayRequest jsArrayRequest = new JsonArrayRequest
                    (url, new Response.Listener<JSONArray>() {
                        @Override
                        public void onResponse(JSONArray response) {

                            List<String> powerEntryList = new ArrayList<>();
                            List<Integer> powerEntryValueList = new ArrayList<>();

                            powerEntryList.add("AUTO");
                            powerEntryValueList.add(-1);

                            List<String> kwhFeedEntryList = new ArrayList<>();
                            List<Integer> kwhFeedEntryValueList = new ArrayList<>();

                            kwhFeedEntryList.add("AUTO");
                            kwhFeedEntryValueList.add(-1);

                            for (int i = 0; i < response.length(); i++) {
                                JSONObject row;
                                try {
                                    row = response.getJSONObject(i);

                                    int id = row.getInt("id");
                                    String name = row.getString("name");
                                    int engineType = row.getInt("engine");


                                    if (engineType == 2 ||
                                            engineType == 5 ||
                                            engineType == 6) {
                                        powerEntryList.add(name);
                                        powerEntryValueList.add(id);
                                        kwhFeedEntryList.add(name);
                                        kwhFeedEntryValueList.add(id);
                                    }
                                } catch (JSONException e) {
                                    e.printStackTrace();
                                }
                            }

                            FeedSpinnerAdapter powerSpinnerAdapter = new FeedSpinnerAdapter(getActivity(),R.layout.support_simple_spinner_dropdown_item,powerEntryValueList,powerEntryList);
                            powerFeedPreference.setAdapter(powerSpinnerAdapter);
                            powerFeedPreference.setEnabled(true);
                            powerFeedPreference.setSelection(powerEntryValueList.indexOf(settings.getPowerFeedId()));

                            FeedSpinnerAdapter useSpinnerAdapter = new FeedSpinnerAdapter(getActivity(),R.layout.support_simple_spinner_dropdown_item,kwhFeedEntryValueList,kwhFeedEntryList);
                            kWhFeedPreference.setAdapter(useSpinnerAdapter);

                            kWhFeedPreference.setEnabled(true);
                            kWhFeedPreference.setSelection(kwhFeedEntryValueList.indexOf(settings.getUseFeedId()));


                        }
                    }, new Response.ErrorListener() {
                        @Override
                        public void onErrorResponse(VolleyError error) {
                            powerFeedPreference.setEnabled(false);
                            kWhFeedPreference.setEnabled(false);

                            new AlertDialog.Builder(getActivity())
                                    .setTitle(R.string.error)
                                    .setMessage(R.string.feed_download_error_message)
                                    .setPositiveButton(android.R.string.ok, null)
                                    .setIcon(android.R.drawable.ic_dialog_alert)
                                    .show();
                        }
                    });
            jsArrayRequest.setTag(TAG);
            HTTPClient.getInstance(getActivity()).addToRequestQueue(jsArrayRequest);
        }
    };
}