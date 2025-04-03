package org.ems.myapps;

import static android.content.Context.MODE_PRIVATE;

import android.content.Context;
import android.content.SharedPreferences;

public class SharedPrefThem {
    SharedPreferences mySharedPref;
    SharedPreferences mSharedPrerences;
    public SharedPrefThem(Context context){
        mySharedPref = context.getSharedPreferences("theme", MODE_PRIVATE);
    }

    public void setNightBlancModeState (Boolean state){
        SharedPreferences.Editor editor = mySharedPref.edit();
        editor.putBoolean("Night Mode", state);
        editor.apply();

    }

    public void setNightVertModeState (Boolean state){
        SharedPreferences.Editor editor = mySharedPref.edit();
        editor.putBoolean("Night Mode Green & Black", state);
        editor.apply();

    }

    public void setlightModeState (Boolean state){
        SharedPreferences.Editor editor = mySharedPref.edit();
        editor.putBoolean("Light Mode", state);
        editor.apply();

    }

    public void setlightnoirModeState (Boolean state){
        SharedPreferences.Editor editor = mySharedPref.edit();
        editor.putBoolean("Light Mode Black & White", state);
        editor.apply();
    }

    public void setlightvertModeState (Boolean state){
        SharedPreferences.Editor editor = mySharedPref.edit();
        editor.putBoolean("Light Mode Green & White", state);
        editor.apply();
    }


    public boolean loadNightBlancModeState(){
        return mySharedPref.getBoolean("Night Mode",false);
    }
    public boolean loadNighVertModeState(){
        return mySharedPref.getBoolean("Night Mode Green & Black",false);
    }
    public boolean loadlightModeState(){
        return mySharedPref.getBoolean("Light Mode",false);
    }
     public boolean loadlightnoirModeState(){
         return mySharedPref.getBoolean("Light Mode Black & White",false);
     }
     public boolean loadlightvertModeState(){
         return mySharedPref.getBoolean("Light Mode Green & White",false);
     }

}
