import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions, ScaledSize } from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

// Responsive dimensions calculation
const getResponsiveDimensions = (dimensions: ScaledSize) => {
  const { width, height } = dimensions;
  const isLandscape = width > height;
  const baseSize = Math.min(width, height);

  return {
    TAB_WIDTH: width / 5,
    WAVE_HEIGHT: Math.min(baseSize * 0.08, 30),
    WAVE_WIDTH: Math.min(baseSize * 0.15, 60),
    ICON_SIZE: Math.min(baseSize * 0.06, 24),
    BAR_HEIGHT: isLandscape 
      ? Math.min(height * 0.12, 50)
      : Math.min(height * 0.08, 60),
    SCALE_FACTOR: 1.2,
  };
};

const tabs = [
  { icon: 'home', type: 'material' },
  { icon: 'dashboard', type: 'material' },
  { icon: 'bar-chart', type: 'material' },
  { icon: 'settings-outline', type: 'ionicon' },
  { icon: 'user', type: 'fontawesome5' },
];

interface AnimatedBottomBarProps {
  currentIndex: number;
  onTabPress: (index: number) => void;
}

export const AnimatedBottomBar: React.FC<AnimatedBottomBarProps> = ({
  currentIndex,
  onTabPress,
}) => {
  const { colors } = useTheme();
  const [dimensions, setDimensions] = useState(() => getResponsiveDimensions(Dimensions.get('window')));
  const animation = useRef(new Animated.Value(currentIndex)).current;

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(getResponsiveDimensions(window));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.spring(animation, {
      toValue: currentIndex,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [currentIndex]);

  const getIconAnimation = (index: number) => {
    return {
      scale: animation.interpolate({
        inputRange: [0, 1, 2, 3, 4],
        outputRange: [1, 1, 1, 1, 1].map((_, i) => i === index ? dimensions.SCALE_FACTOR : 1),
        extrapolate: 'clamp',
      }),
      opacity: animation.interpolate({
    inputRange: [0, 1, 2, 3, 4],
        outputRange: [0.5, 0.5, 0.5, 0.5, 0.5].map((_, i) => i === index ? 1 : 0.5),
        extrapolate: 'clamp',
      }),
    };
  };

  return (
    <View style={[styles.container, { 
      backgroundColor: 'transparent',
      height: dimensions.BAR_HEIGHT,
    }]}>
      {/* Background */}
      <View style={[styles.background, {
        backgroundColor: colors.surface,
        height: dimensions.BAR_HEIGHT,
      }]} />

      {/* Wave Effect */}
      <Animated.View
        style={[
          styles.waveContainer,
          {
            transform: [
              { translateX: animation.interpolate({
                inputRange: [0, 1, 2, 3, 4],
                outputRange: [0, dimensions.TAB_WIDTH, dimensions.TAB_WIDTH * 2, dimensions.TAB_WIDTH * 3, dimensions.TAB_WIDTH * 4],
              })}
            ],
          }
        ]}
      >
        {/* Main wave */}
        
        {/* Left curve */}
        
        {/* Right curve */}
        
      </Animated.View>

      {/* Tab Items */}
      <View style={styles.tabsContainer}>
      {tabs.map((tab, index) => {
        const IconComponent = tab.type === 'material' 
          ? MaterialIcons 
          : tab.type === 'ionicon' 
            ? Ionicons 
            : FontAwesome5;

          const iconAnimation = getIconAnimation(index);

        return (
          <TouchableOpacity
            key={index}
            style={styles.tab}
            onPress={() => onTabPress(index)}
            >
              <Animated.View
                style={{
                  transform: [{ scale: iconAnimation.scale }],
                  opacity: iconAnimation.opacity,
                }}
          >
            <IconComponent
              name={tab.icon}
                  size={dimensions.ICON_SIZE}
              color={currentIndex === index ? colors.primary : colors.textSecondary}
            />
              </Animated.View>
          </TouchableOpacity>
        );
      })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  background: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  waveCurve: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tabsContainer: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AnimatedBottomBar; 