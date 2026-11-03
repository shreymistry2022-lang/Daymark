import { Column, Text } from '@expo/ui/jetpack-compose';
import { paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';
import type { DaymarkTodayWidgetProps } from './widgetTypes';

const DaymarkTodayWidget = (props: DaymarkTodayWidgetProps) => {
  'widget';
  return (
    <Column modifiers={[paddingAll(14)]}>
      <Text>DAYMARK · TODAY</Text>
      <Text>{props.dateLabel}</Text>
      <Text>{props.total === 0 ? 'No habits scheduled' : `${props.completed} of ${props.total} complete`}</Text>
      {props.habits.map((habit, index) => <Text key={`${index}-${habit}`}>{habit}</Text>)}
    </Column>
  );
};

export default createWidget('DaymarkTodayWidget', DaymarkTodayWidget, { completed: 0, total: 0, habits: [], dateLabel: 'Today' });
