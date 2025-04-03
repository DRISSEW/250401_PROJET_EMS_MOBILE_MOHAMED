package org.ems.myapps;


import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.preference.PreferenceManager;

import android.support.annotation.NonNull;
import android.support.annotation.Nullable;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v4.view.ViewPager;
import android.support.v4.widget.DrawerLayout;
import android.support.v7.app.ActionBar;
import android.support.v7.app.ActionBarDrawerToggle;
import android.support.v7.app.AlertDialog;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.AnimationUtils;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import com.viewpagerindicator.PageIndicator;

import org.ems.myapps.chart.DailyBarChart;
import org.ems.myapps.chart.MyElectricDataManager;
import org.ems.myapps.chart.PowerChart;
import org.ems.myapps.chart.UseByDayDataLoader;
import org.ems.myapps.myelectric.MyElectricSettings;
import org.ems.myapps.settings.AccountSettingsActivity;
import org.ems.myapps.settings.SettingsActivity;

/**
 * Handles navigation, account changing and pager
 */
public class MainActivity extends BaseActivity implements AccountListChangeListener {

    //region Variables
    private Toolbar mToolbar;
    private DrawerLayout mDrawer;
    SharedPrefThem sharePrefThem;
    private TextView accountSelector,txtpower,w,now,txtUseToday,kwh,today,pagename;
    private RecyclerView navAccountView;
    private RecyclerView navPageView;
    private MyPagerAdapter pagerAdapter;
    private ViewPager vpPager;

    private boolean fullScreenRequested;

    private boolean accountListVisible = false;

    private Handler mFullscreenHandler = new Handler();

    private Button btn3h,btn6h,day,week,month;

    private PowerChart chart1;
    private DailyBarChart chart2;
    public static class MyPagerAdapter extends FragmentStatePagerAdapter implements PageChangeListener {

        public MyPagerAdapter(FragmentManager fragmentManager) {
            super(fragmentManager);

            EmonApplication.get().addPageChangeListener(this);
        }

        @Override
        public int getCount() {
            return EmonApplication.get().getPages().size();
        }

        // Returns the fragment to display for that page
        @Override
        public Fragment getItem(int position) {
            Log.d("emon", "making page " + position);
            MyElectricMainFragment frag = MyElectricMainFragment.newInstance(EmonApplication.get().getPages().get(position));
            if (position == 0) {
                frag.setUserVisibleHint(true);
            }

            return frag;
        }

        @Override
        public int getItemPosition(Object object) {
            //will cause all cached fragments to be recreated. no problem.
            return POSITION_NONE;
        }

        // Returns the page title for the top indicator
        @Override
        public CharSequence getPageTitle(int position) {
            return EmonApplication.get().getPages().get(position).getName();
        }

        @Override
        public void onAddPage(MyElectricSettings settings) {
            notifyDataSetChanged();
        }

        @Override
        public void onDeletePage(MyElectricSettings settings) {
            notifyDataSetChanged();
        }

        @Override
        public void onUpdatePage(MyElectricSettings settings) {
            notifyDataSetChanged();
        }

        @Override
        public void finishUpdate(ViewGroup container) {
            try {
                super.finishUpdate(container);
            } catch (NullPointerException nullPointerException) {
                System.out.println("Catch the NullPointerException in FragmentPagerAdapter.finishUpdate");
            }
        }
    }
    //endregion


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        sharePrefThem = new SharedPrefThem(this);

        if(sharePrefThem.loadlightModeState()==false){

            if(sharePrefThem.loadNighVertModeState()==true){
                setTheme(R.style.AppThemeNightMode_GreenBlack);
            }
            else if(sharePrefThem.loadNightBlancModeState()==true){
                setTheme(R.style.AppThemeNightMode);
            } else if (sharePrefThem.loadlightnoirModeState()==true) {
                setTheme(R.style.AppThemeLightMode_BlackWhite);
            } else if (sharePrefThem.loadlightvertModeState()==true) {
                setTheme(R.style.AppThemeLightMode_GreenWhite);
            } else {
                setTheme(R.style.AppTheme);
            }
        }

        else {

            if(sharePrefThem.loadNightBlancModeState() == true){
                setTheme(R.style.AppThemeLightMode_BlackWhite);
            }
            else if(sharePrefThem.loadNighVertModeState() == true){
                setTheme(R.style.AppThemeLightMode_GreenWhite);
            }
            else if (sharePrefThem.loadlightnoirModeState()==true) {
                setTheme(R.style.AppThemeLightMode_BlackWhite);
            } else if (sharePrefThem.loadlightvertModeState()==true) {
                setTheme(R.style.AppThemeLightMode_GreenWhite);
            }
            else {
                setTheme(R.style.AppThemeLightMode);

            }

        }
        super.onCreate(savedInstanceState);



        setContentView(R.layout.activity_main);
        UpgradeManager.doUpgrade(this);

        PreferenceManager.setDefaultValues(this, R.xml.main_preferences, false);
        PreferenceManager.setDefaultValues(this, R.xml.me_preferences, false);

        SharedPreferences sp = PreferenceManager.getDefaultSharedPreferences(getBaseContext());

        setKeepScreenOn(sp.getBoolean(getString(R.string.setting_keepscreenon), false));
        setContentView(R.layout.activity_main);

        mToolbar = (Toolbar) findViewById(R.id.main_toolbar);

        if(sharePrefThem.loadlightModeState()==false) {
            mToolbar.setBackgroundColor(getResources().getColor(R.color.colorPrimary));}
        else {mToolbar.setBackgroundColor(getResources().getColor(R.color.chartBlue));}
        setSupportActionBar(mToolbar);

        setUpNavigation();

        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(mOnSystemUiVisibilityChangeListener);

        EmonApplication.get().addAccountChangeListener(this);


//        txtpower=findViewById(R.id.txtPower);
//        w=findViewById(R.id.powerUnits);
//        now=findViewById(R.id.powerLabel);
//        txtUseToday=findViewById(R.id.txtUseToday);
//        kwh=findViewById(R.id.useTodayUnits);
//        today=findViewById(R.id.useTodayLabel);
//        pagename=findViewById(R.id.pageName);
//        btn3h=findViewById(R.id.btnChart1_3H);
//        btn6h=findViewById(R.id.btnChart1_6H);
//        day=findViewById(R.id.btnChart1_D);
//        week=findViewById(R.id.btnChart1_W);
//        month=findViewById(R.id.btnChart1_M);

    }

    @Override
    protected void onResume() {
        super.onResume();
        SharedPreferences sp = PreferenceManager.getDefaultSharedPreferences(getBaseContext());
        setKeepScreenOn(sp.getBoolean(getString(R.string.setting_keepscreenon), false));

        if (EmonApplication.get().getAccounts().isEmpty()) {
            openSettingsActivity();
        }

        //we could have just got back from PageSettings, so set page title if it changed
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null && !EmonApplication.get().getPages().isEmpty() && vpPager != null) {
            Log.d("emon-main", "Resumed setting title to " + EmonApplication.get().getPages().get(vpPager.getCurrentItem()).getName());
            actionBar.setTitle(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));
        }

        //we could have just got back from adding first account.
        if (!EmonApplication.get().getAccounts().isEmpty() && EmonApplication.get().getPages().isEmpty()) {
            accountSelector.setText(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));
            EmonApplication.get().addFirstPage();
        }

    }

    /**
     * Switch drawer layout contents between accounts and apps
     */
    private void toggleNavigation() {
        if (accountListVisible) {
            navAccountView.setVisibility(View.GONE);
            navPageView.setVisibility(View.VISIBLE);
            accountSelector.setCompoundDrawablesWithIntrinsicBounds(0, 0, R.drawable.ic_arrow_drop_down_black_24dp, 0);
            accountListVisible = false;
        } else {
            navAccountView.setVisibility(View.VISIBLE);
            navPageView.setVisibility(View.GONE);
            accountSelector.setCompoundDrawablesWithIntrinsicBounds(0, 0, R.drawable.ic_arrow_drop_up_black_24dp, 0);
            accountListVisible = true;
        }
    }

    private void setUpNavigation() {
        accountSelector = (TextView) findViewById(R.id.selectAccount);

        accountSelector.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                toggleNavigation();
            }
        });
        accountSelector.setText(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));

        //account list
        navAccountView = (RecyclerView) findViewById(R.id.accountMenu);
        navAccountView.setVisibility(View.INVISIBLE);

        if (navAccountView != null) {
            navAccountView.setHasFixedSize(true);
        }

        OnNavigationClick onAccountClickListener = new OnNavigationClick() {
            @Override
            public void onClick(String id) {
                mDrawer.closeDrawers();
                if (id.equals("new")) {
                    addNewAccount();

                } else {
                    toggleNavigation();
                    Log.d("main", "Account " + id);
                    setCurrentAccount(id);
                    ActionBar actionBar = getSupportActionBar();
                    actionBar.setTitle(EmonApplication.get().getAccounts().get(id));
                }
            }
        };

        MenuAccountAdapter accountAdapter = new MenuAccountAdapter(this, onAccountClickListener);
        navAccountView.setAdapter(accountAdapter);
        EmonApplication.get().addAccountChangeListener(accountAdapter);
        RecyclerView.LayoutManager navLayoutManager = new LinearLayoutManager(this);
        navAccountView.setLayoutManager(navLayoutManager);

        //account list
        navPageView = (RecyclerView) findViewById(R.id.appMenu);
        navPageView.setVisibility(View.VISIBLE);

        if (navPageView != null) {
            navPageView.setHasFixedSize(true);
        }

        setUpPages();

        RecyclerView.LayoutManager navAppLayoutManager = new LinearLayoutManager(this);
        navPageView.setLayoutManager(navAppLayoutManager);


        //drawer toggle
        mDrawer = (DrawerLayout) findViewById(R.id.drawer_layout);
        ActionBarDrawerToggle mDrawerToggle = new ActionBarDrawerToggle(this, mDrawer, mToolbar, R.string.open, R.string.close);

        mDrawer.addDrawerListener(mDrawerToggle);
        mDrawerToggle.syncState();

    }

    private void addNewAccount() {


        String newAccountId = EmonApplication.get().addAccount();

        Log.d("emon-main", "Opening New account " + newAccountId);

        Intent intent = new Intent(this, AccountSettingsActivity.class);
        intent.putExtra("account", newAccountId);
        startActivity(intent);
    }

    private void openAccountSettings() {
        Intent intent = new Intent(this, AccountSettingsActivity.class);
        intent.putExtra("account", EmonApplication.get().getCurrentAccount());
        startActivity(intent);
    }


    private void  setUpPages() {
        OnNavigationClick onPageClickListener = new OnNavigationClick() {
            @Override
            public void onClick(String id) {
                mDrawer.closeDrawers();
                if (id.equals("new")) {
                    openNewPageSettings();
                } else if (id.equals("settings")) {
                    openSettingsActivity();
                } else {
                    vpPager.setCurrentItem(Integer.valueOf(id), true);
                }
            }
        };

        MenuPageAdaptor appAdapter = new MenuPageAdaptor(this, onPageClickListener);
        navPageView.setAdapter(appAdapter);

        vpPager = (ViewPager) findViewById(R.id.vpPager);

        if (pagerAdapter != null) {
            //this will wipe the fragments already associated with the pager
            vpPager.setAdapter(null);
            EmonApplication.get().removePageChangeListener(pagerAdapter);

        }

        pagerAdapter = new MyPagerAdapter(getSupportFragmentManager());

        // When swiping between different sections, select the corresponding tab
        vpPager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            @Override
            public void onPageSelected(int position) {
                Log.d("emon-main", "Page Changed to " + EmonApplication.get().getPages().get(position).getId());
                ActionBar actionBar = getSupportActionBar();
                if (actionBar != null && !EmonApplication.get().getPages().isEmpty()) {
                    EmonApplication.get().currentPageIndex = position;
                }
            }
        });

        pagerAdapter.notifyDataSetChanged();
        vpPager.setAdapter(pagerAdapter);

        PageIndicator indicator = (PageIndicator) findViewById(R.id.indicator);

        if(sharePrefThem.loadlightModeState()==false && sharePrefThem.loadlightvertModeState()==false && sharePrefThem.loadlightnoirModeState()==false) {
            View viewind = (View) findViewById(R.id.indicator);
            viewind.setBackgroundColor(getResources().getColor(R.color.windowBackground));
            setUpColorNightMode();
        }
        else { View viewind = (View) findViewById(R.id.indicator);
            viewind.setBackgroundColor(getResources().getColor(R.color.windowBackgroundLight));
            setUpColorLightMode();}

        indicator.setViewPager(vpPager);

    }

    private void setFullScreenIcon(MenuItem item, boolean fullScreen) {
        if (item != null) {
            if (fullScreen) {
                item.setIcon(R.drawable.ic_fullscreen_exit_white_24dp);
            } else {
                item.setIcon(R.drawable.ic_fullscreen_white_24dp);
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
    }

    //region New Changes 01

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_settings) {
            openPageSettings();
            return true;
        } else if (id == R.id.full_screen) {
            boolean fullScreen = setFullScreen();
            setFullScreenIcon(item, fullScreen);
            return true;
        } else if (id == R.id.color) {
            showColorListViewPopup();
            return true;
        }

        return super.onOptionsItemSelected(item);
    }

    private AlertDialog dialog; // Declare the dialog as a class-level variable

    private void showColorListViewPopup() {
        // Create an array of color options with their associated icons
        final ColorOption[] colorOptions = {
                new ColorOption("Default", R.drawable.default_color),
                new ColorOption("Night Mode", R.drawable.night_mode_color),
                new ColorOption("Night Mode Green & Black", R.drawable.night_mode_greenblack),
                new ColorOption("Light Mode", R.drawable.light_mode_color),
                new ColorOption("Light Mode Black & White", R.drawable.light_mode_blackwhite),
                new ColorOption("Light Mode Green & White", R.drawable.light_mode_greenwhite),
        };

        // Create a dialog and set its content view
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = getLayoutInflater().inflate(R.layout.listview_layout, null);
        builder.setView(dialogView);

        // Get a reference to the ListView in the layout
        ListView colorListView = dialogView.findViewById(R.id.color_listview);

        // Create a custom ArrayAdapter for the ListView using the custom layout
        ArrayAdapter<ColorOption> adapter = new ArrayAdapter<ColorOption>(this, R.layout.color_list_item_layout, colorOptions) {
            @NonNull
            @Override
            public View getView(int position, @Nullable View convertView, @NonNull ViewGroup parent) {
                if (convertView == null) {
                    convertView = getLayoutInflater().inflate(R.layout.color_list_item_layout, null);
                }

                ImageView iconImageView = convertView.findViewById(R.id.iconImageView);
                TextView colorNameTextView = convertView.findViewById(R.id.colorNameTextView);

                ColorOption option = getItem(position);

                if (option != null) {
                    iconImageView.setImageResource(option.getIconResId());
                    colorNameTextView.setText(option.getColorName());
                }

                return convertView;
            }
        };

        colorListView.setAdapter(adapter);

        // Set a click listener for the ListView items
        colorListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                String selectedColor = colorOptions[position].getColorName();

                // Handle the selected color (e.g., "Light" or "Dark")
                // You can perform actions based on the selected color here
                // ...
                switch (selectedColor){
                    case "Default":
                        setTheme(R.style.AppTheme);
                        sharePrefThem.setlightModeState(false);
                        sharePrefThem.setlightnoirModeState(false);
                        sharePrefThem.setlightvertModeState(false);
                        sharePrefThem.setNightBlancModeState(false);
                        sharePrefThem.setNightVertModeState(false);
                        setUpColorNightMode();
                        setUpPages();
                        break;
                    case "Night Mode":
                        setTheme(R.style.AppThemeNightMode);
                    sharePrefThem.setlightModeState(false);
                    sharePrefThem.setlightnoirModeState(false);
                    sharePrefThem.setlightvertModeState(false);
                    sharePrefThem.setNightBlancModeState(true);
                    sharePrefThem.setNightVertModeState(false);
                        setUpColorNightMode();
                        setUpPages();
                        break;
                    case "Night Mode Green & Black":
                        setTheme(R.style.AppThemeNightMode_GreenBlack);
                    sharePrefThem.setlightModeState(false);
                    sharePrefThem.setlightnoirModeState(false);
                    sharePrefThem.setlightvertModeState(false);
                    sharePrefThem.setNightBlancModeState(false);
                    sharePrefThem.setNightVertModeState(true);
                        setUpColorNightMode();
                        setUpPages();
                        break;
                    case "Light Mode":
                        setTheme(R.style.AppThemeLightMode);
                    sharePrefThem.setlightModeState(true);
                    sharePrefThem.setlightnoirModeState(false);
                    sharePrefThem.setlightvertModeState(false);
                    sharePrefThem.setNightBlancModeState(false);
                    sharePrefThem.setNightVertModeState(false);
                        setUpColorLightMode();
                        setUpPages();
                        break;
                    case "Light Mode Black & White":
                        setTheme(R.style.AppThemeLightMode_BlackWhite);
                    sharePrefThem.setlightModeState(false);
                    sharePrefThem.setlightnoirModeState(true);
                    sharePrefThem.setlightvertModeState(false);
                    sharePrefThem.setNightBlancModeState(false);
                    sharePrefThem.setNightVertModeState(false);
                        setUpColorLightMode();
                        setUpPages();
                        break;
                    case "Light Mode Green & White":
                        setTheme(R.style.AppThemeLightMode_GreenWhite);
                    sharePrefThem.setlightModeState(false);
                    sharePrefThem.setlightnoirModeState(false);
                    sharePrefThem.setlightvertModeState(true);
                    sharePrefThem.setNightBlancModeState(false);
                    sharePrefThem.setNightVertModeState(false);
                        setUpColorLightMode();
                        setUpPages();
                        break;
                    default:
                        recreate();
                        break;
                }
                // Dismiss the dialog
                dialog.dismiss();
            }
        });

        // Create and show the dialog
        dialog = builder.create(); // Initialize the dialog here
        // Set the background with rounded corners for the dialog's content view
        dialog.getWindow().setBackgroundDrawableResource(R.drawable.chose_color_dialog_radius);

        dialog.show();
    }
    public void setUpColorLightMode(){
        mToolbar.setBackgroundColor(getResources().getColor(R.color.chartBlue));
        View viewind = (View) findViewById(R.id.indicator);
        viewind.setBackgroundColor(getResources().getColor(R.color.windowBackgroundLight));
        View viewNav = (View) findViewById(R.id.nvView);
        viewNav.setBackgroundColor(getResources().getColor(R.color.windowBackgroundLight));
        TextView textacount = (TextView) findViewById(R.id.selectAccount);
        textacount.setTextColor(getResources().getColor(R.color.colorPrimary));
        textacount.setBackgroundColor(getResources().getColor(R.color.chartBlue));

    }

    public void setUpColorNightMode(){

        mToolbar.setBackgroundColor(getResources().getColor(R.color.colorPrimary));
        View viewind = (View) findViewById(R.id.indicator);
        viewind.setBackgroundColor(getResources().getColor(R.color.windowBackground));
        View viewNav = (View) findViewById(R.id.nvView);
        viewNav.setBackgroundColor(getResources().getColor(R.color.windowBackground));
        TextView textacount = (TextView) findViewById(R.id.selectAccount);
        textacount.setTextColor(getResources().getColor(R.color.lightGrey));
        textacount.setBackgroundColor(getResources().getColor(R.color.colorPrimary));

    }

    //endregion



    @Override
    public boolean onPrepareOptionsMenu(Menu menu) {
        super.onPrepareOptionsMenu(menu);
        setFullScreenIcon(menu.findItem(R.id.full_screen), fullScreenRequested);
        return true;
    }

    private void openPageSettings() {
        Intent intent = new Intent(this, MyElectricSettingsActivity.class);
        int index = vpPager.getCurrentItem();
        MyElectricSettings settings = EmonApplication.get().getPages().get(index);
        intent.putExtra("settings", settings);
        startActivity(intent);
    }

    private void openNewPageSettings() {
        Intent intent = new Intent(this, MyElectricSettingsActivity.class);
        startActivity(intent);
    }

    private void setCurrentAccount(String accountId) {
        EmonApplication.get().setCurrentAccount(accountId);
        accountSelector.setText(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));
        setUpPages();

    }

    public boolean setFullScreen() {

        if (fullScreenRequested)
            mFullscreenHandler.removeCallbacksAndMessages(null);
        else
            mFullscreenHandler.post(mSetFullScreenRunner);

        fullScreenRequested = !fullScreenRequested;

        return fullScreenRequested;
    }

    private Runnable mSetFullScreenRunner = new Runnable() {
        @Override
        public void run() {
            if (android.os.Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN |
                                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                                View.SYSTEM_UI_FLAG_IMMERSIVE);
            } else if (android.os.Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN |
                                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LOW_PROFILE |
                                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
            }
        }
    };

    public void setKeepScreenOn(boolean keep_screen_on) {
        if (keep_screen_on)
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private View.OnSystemUiVisibilityChangeListener mOnSystemUiVisibilityChangeListener = new View.OnSystemUiVisibilityChangeListener() {
        @Override
        public void onSystemUiVisibilityChange(int visibility) {
            ActionBar ab = getSupportActionBar();
            if (ab == null)
                return;

            if ((visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == View.VISIBLE) {
                mToolbar.startAnimation(AnimationUtils.loadAnimation(MainActivity.this, R.anim.slide_down));
                ab.show();
                if (fullScreenRequested)
                    mFullscreenHandler.postDelayed(mSetFullScreenRunner, 5000);
            } else {
                mToolbar.startAnimation(AnimationUtils.loadAnimation(MainActivity.this, R.anim.slide_up));
                ab.hide();
            }
        }
    };

    private void openSettingsActivity() {
        Intent intent = new Intent(this, SettingsActivity.class);
        startActivity(intent);
    }

    @Override
    public void onAddAccount(String id, String name) {
        if (id.equals(EmonApplication.get().getCurrentAccount())) {
            accountSelector.setText(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));
        }
    }

    @Override
    public void onDeleteAccount(String id) {

    }

    @Override
    public void onUpdateAccount(String id, String name) {
        if (id.equals(EmonApplication.get().getCurrentAccount())) {
            accountSelector.setText(EmonApplication.get().getAccounts().get(EmonApplication.get().getCurrentAccount()));
        }
    }
}