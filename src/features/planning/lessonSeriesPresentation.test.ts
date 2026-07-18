import { describe, expect, it } from 'vitest';

import { formatLessonSeriesPositionLabel } from './lessonSeriesPresentation';

describe('formatLessonSeriesPositionLabel', () => {
  it('identifies the lesson position within the named series', () => {
    expect(formatLessonSeriesPositionLabel('Lesson 2 of 2', 'Unit 1')).toBe(
      'Lesson 2 of 2 in “Unit 1”',
    );
  });
});
