import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, padding } from '@expo/ui/swift-ui/modifiers';
import { PlatformColor } from 'react-native';
import { createWidget } from 'expo-widgets';
import type { DaymarkTodayWidgetProps } from './widgetTypes';

const DaymarkTodayWidget = (props: DaymarkTodayWidgetProps) => {
  'widget';
  return (
    <VStack modifiers={[containerBackground(PlatformColor('systemBackground'), 'widget'), padding({ all: 14 })]}>
      <Text>DAYMARK · TODAY</Text>
      <Text>{props.dateLabel}</Text>
      <Text>{props.total === 0 ? 'No habits scheduled' : `${props.completed} of ${props.total} complete`}</Text>
      {props.habits.map((habit, index) => <Text key={`${index}-${habit}`}>{habit}</Text>)}
    </VStack>
  );
};

export default createWidget('DaymarkTodayWidget', DaymarkTodayWidget, { completed: 0, total: 0, habits: [], dateLabel: 'Today' });
