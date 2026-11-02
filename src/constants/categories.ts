// src/constants/categories.ts
import { Ionicons } from '@expo/vector-icons';

export interface CategoryDefinition {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}

export const HABIT_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'morning',
    name: 'Morning Routine',
    icon: 'sunny-outline',
    color: '#FF7A00',
    description: 'Awaken with focus & intention',
  },
  {
    id: 'fitness',
    name: 'Health & Fitness',
    icon: 'fitness-outline',
    color: '#10B981',
    description: 'Workouts, movement & strength',
  },
  {
    id: 'nutrition',
    name: 'Nutrition & Water',
    icon: 'water-outline',
    color: '#06B6D4',
    description: 'Hydration, clean meals & fasting',
  },
  {
    id: 'focus',
    name: 'Focus & Career',
    icon: 'briefcase-outline',
    color: '#3B82F6',
    description: 'Deep work, study & productivity',
  },
  {
    id: 'learning',
    name: 'Learning & Reading',
    icon: 'book-outline',
    color: '#8B5CF6',
    description: 'Books, skills & audiobooks',
  },
  {
    id: 'mindfulness',
    name: 'Mindfulness & Meditation',
    icon: 'flower-outline',
    color: '#EC4899',
    description: 'Breathwork, calm & gratitude',
  },
  {
    id: 'evening',
    name: 'Night Routine',
    icon: 'moon-outline',
    color: '#6366F1',
    description: 'Unwind, journal & disconnect',
  },
  {
    id: 'sleep',
    name: 'Sleep & Recovery',
    icon: 'bed-outline',
    color: '#64748B',
    description: '8 hours sleep, dark room & rest',
  },
  {
    id: 'finance',
    name: 'Finance & Wealth',
    icon: 'wallet-outline',
    color: '#F59E0B',
    description: 'Budget tracking, savings & investing',
  },
  {
    id: 'creativity',
    name: 'Creativity & Art',
    icon: 'brush-outline',
    color: '#D946EF',
    description: 'Writing, design & creative hobby',
  },
  {
    id: 'detox',
    name: 'Digital Detox',
    icon: 'phone-portrait-outline',
    color: '#EF4444',
    description: 'Screen time limits & social breaks',
  },
  {
    id: 'organization',
    name: 'Home & Organization',
    icon: 'file-tray-full-outline',
    color: '#14B8A6',
    description: 'Declutter, clean space & inbox zero',
  },
  {
    id: 'relationships',
    name: 'Relationships & Social',
    icon: 'people-outline',
    color: '#F43F5E',
    description: 'Family check-in, friends & calls',
  },
  {
    id: 'nature',
    name: 'Outdoor & Nature',
    icon: 'leaf-outline',
    color: '#84CC16',
    description: 'Fresh air, walks & sunlight',
  },
];
