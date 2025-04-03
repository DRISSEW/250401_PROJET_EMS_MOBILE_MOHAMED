package org.ems.myapps;


import android.annotation.TargetApi;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.SystemClock;
import android.preference.PreferenceManager;
import android.support.annotation.Nullable;
import android.support.design.widget.CoordinatorLayout;
import android.support.design.widget.Snackbar;
import android.support.v4.app.Fragment;
import android.support.v4.app.NotificationCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.widget.SwitchCompat;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.View.OnClickListener;
import android.view.View.OnLayoutChangeListener;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.github.mikephil.charting.charts.BarChart;
import com.github.mikephil.charting.charts.LineChart;

import org.ems.myapps.chart.DailyBarChart;
import org.ems.myapps.chart.FeedDataLoader;
import org.ems.myapps.chart.MyElectricDataManager;
import org.ems.myapps.chart.PowerChart;
import org.ems.myapps.chart.PowerChartDataLoader;
import org.ems.myapps.chart.PowerNowDataLoader;
import org.ems.myapps.chart.UseByDayDataLoader;
import org.ems.myapps.myelectric.MyElectricSettings;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Currency;
import java.util.Locale;

/**
 * Handles UI components for MyElectric
 */
public class MyElectricMainFragment extends Fragment implements MyElectricDataManager {

    //region Variables
    static final int dailyChartUpdateInterval = 60000;
    private String emonCmsUrl;
    private String emonCmsApiKey;
    int powerfed = 0;
    private MyElectricSettings myElectricSettings;

    private PowerChart powerChart;
    private DailyBarChart dailyUsageBarChart;
    private int daysToDisplay;

    private TextView txtPower;
    private TextView txtUseToday;

    private TextView txtPowerUnits;
    private TextView txtUseTodayUnits;
    int lastUseFeedId = 0;
    String Grandeur_choisie = " ";
    private SwitchCompat costSwitch;
    private Handler mHandler = new Handler();

    long timezone = 0;


    long nextDailyChartUpdate = 0;


    double toYesterdayPowerUsagekWh;
    float totalPowerUsagekWh;

    double powerNowWatts = 0;
    double powerTodaykWh = 0;

    private boolean blnShowCost = false;

    private View rootView;
    private Snackbar snackbar;
    private FeedDataLoader mGetFeedsRunner;
    private PowerChartDataLoader mGetPowerHistoryRunner;
    private Runnable mGetPowerRunner;
    private UseByDayDataLoader mGetUsageByDayRunner;

    private boolean isMessage = false;
    private boolean isVisibleInPager = false;

    private static final long UPDATE_INTERVAL = 20 * 60 * 1000;
    //endregion

    public static MyElectricMainFragment newInstance(MyElectricSettings settings) {
        MyElectricMainFragment yf = new MyElectricMainFragment();
        Log.d("emon-me", "Making new instance " + settings);

        Bundle args = new Bundle();
        args.putParcelable("settings", settings);
        yf.setArguments(args);
        return yf;
    }

    private void updateTextFields() {
        if (getActivity() != null) {

            //View view = getView ();
            //txtPower = (TextView) view.findViewById (R.id.txtPower);
            //int num1 =  Integer.parseInt(txtPower.toString());
            double powerNowKiloWatts = powerNowWatts / 1000.0; // Convert watts to kilowatts
            if (blnShowCost) {
                txtPower.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.2f/h", (powerNowWatts * 0.001) * myElectricSettings.getUnitCostFloat()));
                txtUseToday.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.2f", powerTodaykWh * myElectricSettings.getUnitCostFloat()));

                String powerCostSymbol = myElectricSettings.getCostSymbol();
                try {
                    if (powerCostSymbol.equals("0"))
                        powerCostSymbol = Currency.getInstance(Locale.getDefault()).getSymbol();
                    if (powerCostSymbol.equals("custom"))
                        powerCostSymbol = myElectricSettings.getCustomCurrencySymbol();
                } catch (IllegalArgumentException e) {
                    powerCostSymbol = "£";
                }

                txtPowerUnits.setText(powerCostSymbol);
                txtUseTodayUnits.setText(powerCostSymbol);

            } else {
                if (powerNowWatts >= 1000) {
                    txtPower.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.2f", powerNowKiloWatts));
                    txtUseToday.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.1f", powerTodaykWh));
                    txtPowerUnits.setText("kW");
                    txtUseTodayUnits.setText("kWh");
                } else {
                    txtPower.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.0f", powerNowWatts));
                    txtUseToday.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.1f", powerTodaykWh));
                    txtPowerUnits.setText("W");
                    txtUseTodayUnits.setText("kWh");
                }
                txtUseToday.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.1f", powerTodaykWh));

                powerfed = myElectricSettings.getPowerFeedId();
                Grandeur_choisie = myElectricSettings.getGrandeurs_physiques();
                try {
                    if (Grandeur_choisie.contains(getActivity().getResources().getString(R.string.Temperature))) {
                        txtPowerUnits.setText("°C");
                    } else if (Grandeur_choisie.contains(getActivity().getResources().getString(R.string.autre))) {
                        String Grandeur_unite_autreSymbol = myElectricSettings.getGrandeur_unite_autreSymbol();
                        txtPowerUnits.setText(Grandeur_unite_autreSymbol);
                    } else if (Grandeur_choisie.contains(getActivity().getResources().getString(R.string.Tension))) {
                        txtPowerUnits.setText("V");
                        txtPower.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.0f", powerNowWatts / 10));
                    } else if (Grandeur_choisie.contains(getActivity().getResources().getString(R.string.Humidite))) {
                        txtPowerUnits.setText("%");
                    } else if (Grandeur_choisie.contains(getActivity().getResources().getString(R.string.Courant))) {
                        txtPowerUnits.setText("A");
                        double v = powerNowWatts / 10;
                        txtPower.setText(String.format(getActivity().getResources().getConfiguration().locale, "%.0f", powerNowWatts / v));
                    }
                } catch (IllegalArgumentException e) {
                    powerfed = 0;
                }


            }
        }

//         Call the checkUpdateRunnable
        mHandler.removeCallbacks(checkUpdateRunnable); // Remove existing callbacks
        mHandler.postDelayed(checkUpdateRunnable, UPDATE_INTERVAL);
    }


    @Override
    public void onStop() {
        super.onStop();

        //         Call the checkUpdateRunnable
        mHandler.removeCallbacks(checkUpdateRunnable); // Remove existing callbacks
        mHandler.postDelayed(checkUpdateRunnable, UPDATE_INTERVAL);
    }

    @TargetApi(Build.VERSION_CODES.M)
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments().containsKey("settings")) {
            myElectricSettings = getArguments().getParcelable("settings");

        }

        SharedPreferences sp = PreferenceManager.getDefaultSharedPreferences(getContext());
        if (sp.contains("show_cost")) {
            blnShowCost = sp.getBoolean("show_cost", false);
        }

    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        rootView = inflater.inflate(R.layout.me_fragment, container, false);

        return rootView;
    }

    @Override
    public void onActivityCreated(Bundle savedInstanceState) {
        super.onActivityCreated(savedInstanceState);

        View view = getView();

        if (view == null)
            throw new NullPointerException("getView returned null");

        view.addOnLayoutChangeListener(new OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int left, int top, int right, int bottom, int oldLeft, int oldTop, int oldRight, int oldBottom) {
                if (v.getWidth() != 0) {
                    boolean isLandscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
                    DisplayMetrics displayMetrics = getResources().getDisplayMetrics();
                    int addedDays = getActivity().getIntent().getIntExtra("addedDays", -1);
                    if (isLandscape) {
                        addedDays = getActivity().getIntent().getIntExtra("addedDays", -10);
                    }
//                    int width = getActivity().getIntent().getIntExtra("width", 1150);
                    //The width is the solution for the landscape bug
                    setDaysToDisplay(displayMetrics.widthPixels, displayMetrics.density, addedDays);
                }
            }
        });

        setHasOptionsMenu(true);


        timezone = (long) Math.floor((Calendar.getInstance().get(Calendar.ZONE_OFFSET) + Calendar.getInstance().get(Calendar.DST_OFFSET)) * 0.001);

        TextView txtPageName = (TextView) view.findViewById(R.id.pageName);
        txtPageName.setText(myElectricSettings.getName());
        txtPower = (TextView) view.findViewById(R.id.txtPower);
        txtUseToday = (TextView) view.findViewById(R.id.txtUseToday);

        txtPowerUnits = (TextView) view.findViewById(R.id.powerUnits);
        txtUseTodayUnits = (TextView) view.findViewById(R.id.useTodayUnits);
        Button power3hButton = (Button) view.findViewById(R.id.btnChart1_3H);
        Button power6hButton = (Button) view.findViewById(R.id.btnChart1_6H);
        Button power1dButton = (Button) view.findViewById(R.id.btnChart1_D);
        Button power1wButton = (Button) view.findViewById(R.id.btnChart1_W);
        Button power1mButton = (Button) view.findViewById(R.id.btnChart1_M);
        Button oneWeekBtn = (Button) view.findViewById(R.id.oneWeekBtn);
        Button twoWeekBtn = (Button) view.findViewById(R.id.twoWeekBtn);
        Button threeWeekBtn = (Button) view.findViewById(R.id.threeWeekBtn);
        Button fourWeekBtn = (Button) view.findViewById(R.id.fourWeekBtn);
        Button fiveWeekBtn = (Button) view.findViewById(R.id.fiveWeekBtn);

        power3hButton.setOnClickListener(buttonListener);
        power6hButton.setOnClickListener(buttonListener);
        power1dButton.setOnClickListener(buttonListener);
        power1wButton.setOnClickListener(buttonListener);
        power1mButton.setOnClickListener(buttonListener);
        oneWeekBtn.setOnClickListener(durationButtonListener);
        twoWeekBtn.setOnClickListener(durationButtonListener);
        threeWeekBtn.setOnClickListener(durationButtonListener);
        fourWeekBtn.setOnClickListener(durationButtonListener);
        fiveWeekBtn.setOnClickListener(durationButtonListener);

        powerChart = new PowerChart((LineChart) view.findViewById(R.id.chart1), getActivity());
        dailyUsageBarChart = new DailyBarChart((BarChart) view.findViewById(R.id.chart2), getActivity());
        dailyUsageBarChart.setShowCost(blnShowCost);
        dailyUsageBarChart.setPowerCost(myElectricSettings.getUnitCostFloat());

        DisplayMetrics displayMetrics = getResources().getDisplayMetrics();
        setDaysToDisplay(displayMetrics.widthPixels, displayMetrics.density, -1);

        setUpCharts(savedInstanceState);
    }

    private OnClickListener durationButtonListener = new OnClickListener() {
        public void onClick(View v) {

            int addedDays;
            boolean isLandscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;

            int clickedButtonId = v.getId();

            if (clickedButtonId == R.id.oneWeekBtn) {

                addedDays = -1;
                if (isLandscape) {
                    addedDays = -10;
                }

                // Restart the activity with the updated number of days
                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.putExtra("addedDays", addedDays);
                startActivity(intent);
                getActivity().finish(); // Close the current activity
                return; // Exit the method to avoid executing the rest of the code for other buttons
            } else if (clickedButtonId == R.id.twoWeekBtn) {
                addedDays = 6;
                if (isLandscape) {
                    addedDays = -3;
                }

                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.putExtra("addedDays", addedDays);
                startActivity(intent);
                getActivity().finish();
                return;
            } else if (clickedButtonId == R.id.threeWeekBtn) {
                addedDays = 6;
                if (isLandscape) {
                    addedDays = 4;
                }

                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.putExtra("addedDays", addedDays);
                startActivity(intent);
                getActivity().finish();
                return;
            } else if (clickedButtonId == R.id.fourWeekBtn) {
                addedDays = 6;
                if (isLandscape) {
                    addedDays = 11;
                }

                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.putExtra("addedDays", addedDays);
                startActivity(intent);
                getActivity().finish();
                return;
            } else if (clickedButtonId == R.id.fiveWeekBtn) {
                addedDays = 6;
                if (isLandscape) {
                    addedDays = 18;
                }

                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.putExtra("addedDays", addedDays);
                startActivity(intent);
                getActivity().finish();
                return;
            }

            HTTPClient.getInstance(getActivity()).cancellAll(getPageTag());
            mHandler.removeCallbacksAndMessages(null);
            mHandler.post(mGetPowerHistoryRunner);

        }
    };

    //responsible for number of days in the DailyBarChart
    private void setDaysToDisplay(int width, float density, int addedDays) {
        daysToDisplay = Math.round((width / density) / 52) + addedDays;
        if (mGetUsageByDayRunner != null) {
            mGetUsageByDayRunner.setDaysToDisplay(daysToDisplay);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);

        if (newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE ||
                newConfig.orientation == Configuration.ORIENTATION_PORTRAIT) {
            // Restart the activity with the updated number of days
            Intent intent = new Intent(getContext(), MainActivity.class);
            startActivity(intent); // Close the current activity
        }
    }


    @Override
    public void setUserVisibleHint(boolean isVisibleToUser) {
        if (myElectricSettings != null) {
            Log.d("me", "visibility hint " + myElectricSettings.getName() + " - " + isVisibleToUser);
        }
        super.setUserVisibleHint(isVisibleToUser);
        if (!isVisibleToUser && snackbar != null) {
            snackbar.dismiss();
        } else if (isVisibleToUser && isMessage) {
            getSnackbar().show();
        }
        isVisibleInPager = isVisibleToUser;
    }

    private void loadConfig() {

        SharedPreferences sp = EmonApplication.get().getSharedPreferences(EmonApplication.get().getCurrentAccount());
        emonCmsUrl = sp.getBoolean(getString(R.string.setting_usessl), false) ? "https://" : "http://";
        emonCmsUrl += sp.getString(getString(R.string.setting_url), "ems.org");
        emonCmsApiKey = sp.getString(getString(R.string.setting_apikey), null);

    }


    private void setUpCharts(Bundle savedInstanceState) {

        if (savedInstanceState != null) {


            powerChart.setChartLength(savedInstanceState.getInt("power_graph_length", -6));
            powerNowWatts = savedInstanceState.getDouble("power_now", 0);
            powerTodaykWh = savedInstanceState.getDouble("power_today", 0);

            int[] chart2_colors = savedInstanceState.getIntArray("chart2_colors");

            updateTextFields();

            //put stored data back in the charts

            int lastPowerFeedId = savedInstanceState.getInt("power_feed_id");
            if (lastPowerFeedId > 0 && lastPowerFeedId == myElectricSettings.getPowerFeedId()) {
                ArrayList<String> chartLabels = savedInstanceState.getStringArrayList("chart1_labels");
                double saved_chart1_values[] = savedInstanceState.getDoubleArray("chart1_values");
                powerChart.restoreData(chartLabels, saved_chart1_values);
            }

            lastUseFeedId = savedInstanceState.getInt("use_feed_id");
            if (lastUseFeedId > 0 && lastUseFeedId == myElectricSettings.getUseFeedId()) {
                double saved_chart2_values[] = savedInstanceState.getDoubleArray("chart2_values");
                ArrayList<String> chart2Labels = savedInstanceState.getStringArrayList("chart2_labels");
                dailyUsageBarChart.restoreData(chart2Labels, saved_chart2_values, chart2_colors, daysToDisplay);
            }
        }

    }


    @Override
    public void onSaveInstanceState(Bundle outState) {

        outState.putInt("power_graph_length", powerChart.getChartLength());
        outState.putDouble("power_now", powerNowWatts);
        outState.putDouble("power_today", powerTodaykWh);

        outState.putInt("power_feed_id", myElectricSettings.getPowerFeedId());
        outState.putInt("use_feed_id", myElectricSettings.getUseFeedId());
        outState.putString("Grandeurs_physique_param", myElectricSettings.getGrandeurs_physiques());


        outState.putParcelable("settings", myElectricSettings);
        outState.putIntArray("chart2_colors", dailyUsageBarChart.getBarColours());

        double[] values = new double[powerChart.getValues().size()];

        for (int i = 0; i < powerChart.getValues().size(); i++)
            values[i] = powerChart.getValues().get(i);

        outState.putStringArrayList("chart1_labels", powerChart.getLabels());
        outState.putDoubleArray("chart1_values", values);

        values = new double[dailyUsageBarChart.getValues().size()];

        for (int i = 0; i < dailyUsageBarChart.getValues().size(); i++)
            values[i] = dailyUsageBarChart.getValues().get(i);

        outState.putStringArrayList("chart2_labels", dailyUsageBarChart.getLabels());
        outState.putDoubleArray("chart2_values", values);

        super.onSaveInstanceState(outState);
    }

    @Override
    public void onCreateOptionsMenu(Menu menu, MenuInflater inflater) {
        inflater.inflate(R.menu.me_menu, menu);
        super.onCreateOptionsMenu(menu, inflater);
        MenuItem cost = menu.findItem(R.id.cost_switch);
        costSwitch = (SwitchCompat) cost.getActionView();
        costSwitch.setOnCheckedChangeListener(checkedChangedListener);
        costSwitch.setChecked(blnShowCost);
    }

    @Override
    public void onDetach() {
        super.onDetach();

        try {
            Field childFragmentManager = Fragment.class.getDeclaredField("mChildFragmentManager");
            childFragmentManager.setAccessible(true);
            childFragmentManager.set(this, null);

        } catch (NoSuchFieldException e) {
            throw new RuntimeException(e);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }


    @Override
    public void onResume() {

        super.onResume();
        clearMessage();
        loadConfig();

        mGetPowerHistoryRunner = new PowerChartDataLoader(powerChart, this.getActivity(), this);
        mGetFeedsRunner = new FeedDataLoader(getActivity(), this);
        mGetPowerRunner = new PowerNowDataLoader(getActivity(), this);
        mGetUsageByDayRunner = new UseByDayDataLoader(getActivity(), this, dailyUsageBarChart);

        dailyUsageBarChart.setPowerCost(myElectricSettings.getUnitCostFloat());

        if (emonCmsApiKey == null || emonCmsApiKey.equals("") || emonCmsUrl == null || emonCmsUrl.equals("")) {
            showMessage(R.string.server_not_configured);
        } else if (myElectricSettings.getPowerFeedId() == -1 || myElectricSettings.getUseFeedId() == -1) {
            mHandler.post(mGetFeedsRunner);
        } else if (myElectricSettings.getPowerFeedId() >= 0 && myElectricSettings.getUseFeedId() >= 0) {
            clearMessage();
            mHandler.post(mGetPowerRunner);
        }
    }

    @Override
    public void onHiddenChanged(boolean hidden) {
        if (hidden) {
            clearMessage();
        }
        super.onHiddenChanged(hidden);
    }

    @Override
    public void onPause() {
        super.onPause();

        clearMessage();
        HTTPClient.getInstance(getActivity()).cancellAll(getPageTag());
        mHandler.removeCallbacksAndMessages(null);
    }

    private CompoundButton.OnCheckedChangeListener checkedChangedListener = new CompoundButton.OnCheckedChangeListener() {
        @TargetApi(Build.VERSION_CODES.M)
        @Override
        public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
            blnShowCost = isChecked;
            SharedPreferences sp = PreferenceManager.getDefaultSharedPreferences(getContext());
            sp.edit().putBoolean("show_cost", blnShowCost).apply();
            dailyUsageBarChart.setShowCost(blnShowCost);
            dailyUsageBarChart.refreshChart();
            updateTextFields();
        }
    };
    private OnClickListener buttonListener = new OnClickListener() {
        public void onClick(View v) {

            switch (v.getId()) {
                case R.id.btnChart1_3H:
                    powerChart.setChartLength(-3);
                    break;
                case R.id.btnChart1_6H:
                    powerChart.setChartLength(-6);
                    break;
                case R.id.btnChart1_D:
                    powerChart.setChartLength(-24);
                    break;
                case R.id.btnChart1_W:
                    powerChart.setChartLength(-168); // 7 * 24
                    break;
                case R.id.btnChart1_M: // 4 Weeks
                    powerChart.setChartLength(-720);// 30 * 24
                    break;
            }

            HTTPClient.getInstance(getActivity()).cancellAll(getPageTag());
            mHandler.removeCallbacksAndMessages(null);
            mHandler.post(mGetPowerHistoryRunner);
        }
    };

    @Override
    public void loadPowerNow(int delay) {
        mHandler.postDelayed(mGetPowerRunner, delay);
    }

    @Override
    public void loadPowerHistory(int delay) {
        mHandler.postDelayed(mGetPowerHistoryRunner, delay);
    }

    @Override
    public boolean loadUseHistory(int delay) {
        if (Calendar.getInstance().getTimeInMillis() > nextDailyChartUpdate) {
            nextDailyChartUpdate = Calendar.getInstance().getTimeInMillis() + dailyChartUpdateInterval;
            mHandler.postDelayed(mGetUsageByDayRunner, delay);
            return true;
        }
        return false;

    }

    @Override
    public void loadFeeds(int delay) {
        mHandler.postDelayed(mGetFeedsRunner, delay);
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences sharedPreferences, String key) {

    }


    private Snackbar getSnackbar() {
        if (snackbar == null && !this.isDetached() && findSuitableParent(rootView.findViewById(R.id.mefrag)) != null) {
            snackbar = Snackbar.make(rootView.findViewById(R.id.mefrag), R.string.connection_error, Snackbar.LENGTH_INDEFINITE);
            View snackbar_view = snackbar.getView();
            snackbar_view.setBackgroundColor(Color.GRAY);
            TextView tv = (TextView) snackbar_view.findViewById(android.support.design.R.id.snackbar_text);
            tv.setMaxLines(5);
            tv.setTypeface(null, Typeface.BOLD);
        }
        return snackbar;
    }

    private static ViewGroup findSuitableParent(View view) {
        ViewGroup fallback = null;
        do {
            if (view instanceof CoordinatorLayout) {
                // We've found a CoordinatorLayout, use it
                return (ViewGroup) view;
            } else if (view instanceof FrameLayout) {
                if (view.getId() == android.R.id.content) {
                    // If we've hit the decor content view, then we didn't find a CoL in the
                    // hierarchy, so use it.
                    return (ViewGroup) view;
                } else {
                    // It's not the content view but we'll use it as our fallback
                    fallback = (ViewGroup) view;
                }
            }

            if (view != null) {
                // Else, we will loop and crawl up the view hierarchy and try to find a parent
                final ViewParent parent = view.getParent();
                view = parent instanceof View ? (View) parent : null;
            }
        } while (view != null);

        // If we reach here then we didn't find a CoL or a suitable content view so we'll fallback
        return fallback;
    }


    @Override
    public void showMessage(String message) {
        isMessage = true;
        if (myElectricSettings != null) {
            Log.d("me", "showing message " + myElectricSettings.getName() + " - " + message);
        }
        Snackbar snackbar = getSnackbar();
        if (snackbar != null) {
            snackbar.setText(message);
            if (isVisibleInPager) {
                getSnackbar().show();
            }
        }
    }

    @Override
    public void showMessage(int message) {
        isMessage = true;
        if (myElectricSettings != null) {
            Log.d("me", "showing message " + myElectricSettings.getName() + " - " + message);
        }

        Snackbar snackbar = getSnackbar();
        if (snackbar != null) {
            snackbar.setText(message);
            if (isVisibleInPager) {
                getSnackbar().show();
            }
        }
    }

    @Override
    public void clearMessage() {
        isMessage = false;
        if (snackbar != null && snackbar.isShown()) {
            snackbar.dismiss();
        }
    }

    @Override
    public String getEmonCmsUrl() {
        return emonCmsUrl;
    }

    @Override
    public String getEmoncmsApikey() {
        return emonCmsApiKey;
    }

    @Override
    public void setFeedIds(int flowId, int useId) {
        myElectricSettings.setPowerFeedId(flowId);
        myElectricSettings.setUseFeedId(useId);
    }

    @Override
    public void setCurrentValues(float powerNowWatts, float totalPowerUsagekWh) {
        this.powerNowWatts = powerNowWatts;

        this.totalPowerUsagekWh = totalPowerUsagekWh;

        if (toYesterdayPowerUsagekWh > 0) {
            this.powerTodaykWh = totalPowerUsagekWh - toYesterdayPowerUsagekWh;
        }
        updateTextFields();
    }

    @Override
    public float getTotalUsagekWh() {
        return totalPowerUsagekWh;
    }

    @Override
    public void setUseToYesterday(float useToYesterdaykWh) {
        this.toYesterdayPowerUsagekWh = useToYesterdaykWh;
        this.powerTodaykWh = totalPowerUsagekWh - toYesterdayPowerUsagekWh;
        updateTextFields();

    }

    @Override
    public String getPageTag() {
        return EmonApplication.get().getCurrentAccount() + myElectricSettings.getName();
    }

    @Override
    public MyElectricSettings getSettings() {
        return myElectricSettings;
    }

    private Runnable checkUpdateRunnable = new Runnable() {
        // Add a variable to store the previous value of txtPower
        private String previousTxtPowerValue = "";

        @Override
        public void run() {
            // Check if txtPower has been updated
            String currentTxtPowerValue = txtPower.getText().toString();
            if (!currentTxtPowerValue.equals(previousTxtPowerValue)) {
                // txtPower has been updated, store the current value and reschedule the check
                previousTxtPowerValue = currentTxtPowerValue;
                mHandler.postDelayed(this, UPDATE_INTERVAL);
            } else {
                // Show a notification as txtPower hasn't updated in some time
                showNotification(String.format("Account : %s | The power value has not changed over the last 20 minutes!",
                        EmonApplication.get().getCurrentAccountName()));
            }
        }
    };

    private void showNotification(String message) {
        // Use the Context object to create and show the notification
        NotificationManager notificationManager = (NotificationManager) getActivity().getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getActivity(), "channel_id")
                .setSmallIcon(R.mipmap.img_520)
                .setContentTitle("Something is wrong")
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        // Show the notification
        notificationManager.notify(1, builder.build());
    }

}
