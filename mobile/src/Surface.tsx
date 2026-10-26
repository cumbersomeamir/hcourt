import { useId, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { homeTiles } from './homeTiles';

function gradientColor(value: string) {
  const rgba = value.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  return rgba
    ? {
        stopColor: `rgb(${rgba[1]},${rgba[2]},${rgba[3]})`,
        stopOpacity: Number(rgba[4]),
      }
    : { stopColor: value };
}

export function TileSurface({ tile }: { tile: (typeof homeTiles)[number] }) {
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState({ width: 180, height: 180 });
  const { width, height } = size;
  const angle = (tile.angle * Math.PI) / 180;
  const dx = Math.sin(angle),
    dy = -Math.cos(angle);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={event => setSize(event.nativeEvent.layout)}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient
            id={`${id}base`}
            gradientUnits="userSpaceOnUse"
            x1={(width - dx * length) / 2}
            y1={(height - dy * length) / 2}
            x2={(width + dx * length) / 2}
            y2={(height + dy * length) / 2}
          >
            {tile.stops.map((color, index) => (
              <Stop
                key={index}
                offset={[0, tile.middle, 1][index]}
                {...gradientColor(color)}
              />
            ))}
          </LinearGradient>
          {tile.glows.map((glow, index) => (
            <RadialGradient
              key={index}
              id={`${id}glow${index}`}
              gradientUnits="userSpaceOnUse"
              cx={glow.x * width}
              cy={glow.y * height}
              r={Math.hypot(width, height) * glow.radius}
            >
              <Stop offset="0" {...gradientColor(glow.color)} />
              <Stop offset="1" {...gradientColor(glow.color)} stopOpacity={0} />
            </RadialGradient>
          ))}
          <LinearGradient id={`${id}sheen`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="white" stopOpacity={0.04} />
            <Stop offset="0.2" stopColor="white" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#0f172a" stopOpacity={0} />
            <Stop offset="1" stopColor="#0f172a" stopOpacity={0.14} />
          </LinearGradient>
          <LinearGradient id={`${id}edge`}>
            <Stop offset="0" stopColor="white" stopOpacity={0} />
            <Stop offset="0.5" stopColor="white" stopOpacity={0.18} />
            <Stop offset="1" stopColor="white" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}base)`} />
        {[1, 0].map(index => (
          <Rect
            key={index}
            width="100%"
            height="100%"
            fill={`url(#${id}glow${index})`}
          />
        ))}
        <Rect width="100%" height="100%" fill={`url(#${id}sheen)`} />
        <Rect
          x={20}
          width={Math.max(0, width - 40)}
          height={1}
          fill={`url(#${id}edge)`}
        />
      </Svg>
      <Image
        source={require('./assets/glow-large.png')}
        style={{
          position: 'absolute',
          left: width - 256,
          top: -144,
          width: 480,
          height: 480,
          tintColor: tile.orb,
          opacity: 0.25,
        }}
      />
      <Image
        source={require('./assets/glow-small.png')}
        style={{
          position: 'absolute',
          left: -80,
          top: height - 200,
          width: 320,
          height: 320,
          tintColor: tile.orb,
          opacity: 0.25,
        }}
      />
    </View>
  );
}

export function Background({ home = false }: { home?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}body`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="#030712" />
            <Stop offset="0.5" stopColor="#0b1a3b" />
            <Stop offset="1" stopColor="#0f172a" />
          </LinearGradient>
          <RadialGradient
            id={`${id}warm`}
            cx="50%"
            cy="-10%"
            rx="180%"
            ry="38%"
          >
            <Stop offset="0" stopColor="#f97316" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#f97316" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}cyan`} cx="35%" cy="15%" rx="90%" ry="45%">
            <Stop offset="0" stopColor="#06b6d4" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#06b6d4" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}amber`} cx="65%" cy="35%" rx="85%" ry="40%">
            <Stop offset="0" stopColor="#f59e0b" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#f59e0b" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}green`} cx="70%" cy="95%" rx="90%" ry="45%">
            <Stop offset="0" stopColor="#10b981" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#10b981" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}body)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}warm)`} />
        {home &&
          ['cyan', 'amber', 'green'].map(name => (
            <Rect
              key={name}
              width="100%"
              height="100%"
              fill={`url(#${id}${name})`}
            />
          ))}
      </Svg>
    </View>
  );
}
