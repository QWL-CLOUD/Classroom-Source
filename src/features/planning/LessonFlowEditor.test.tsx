import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { LibraryCatalogItem } from '@/domain/models/entities';

import type { LessonContentEditorValues } from './planningEditorModel';
import { LessonFlowEditor } from './LessonFlowEditor';

describe('LessonFlowEditor', () => {
  it('preserves a rapid field edit across a stale controlled rerender', () => {
    const values: LessonContentEditorValues = {
      learningTarget: '',
      notes: '',
      lessonFlow: [
        {
          id: 'step-1',
          title: '',
          phase: 'opening',
          durationMinutes: '',
          details: '',
          teacherNotes: '',
        },
      ],
    };
    let latestValues = values;
    const onChange = vi.fn(
      (update: (current: LessonContentEditorValues) => LessonContentEditorValues) => {
        latestValues = update(latestValues);
      },
    );
    const view = render(
      <LessonFlowEditor idPrefix="lesson-flow-test" values={values} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Step title'), {
      target: { value: 'Welcome and notice' },
    });

    expect(latestValues.lessonFlow[0]).toEqual(
      expect.objectContaining({ title: 'Welcome and notice' }),
    );

    // A lagging controlled rerender may recreate the previous snapshot with a
    // new object identity. It must not replace the newer synchronous draft.
    const staleValues: LessonContentEditorValues = {
      ...values,
      lessonFlow: values.lessonFlow.map((step) => ({ ...step })),
    };
    view.rerender(
      <LessonFlowEditor idPrefix="lesson-flow-test" values={staleValues} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '5' } });

    expect(latestValues.lessonFlow[0]).toEqual(
      expect.objectContaining({
        title: 'Welcome and notice',
        durationMinutes: '5',
      }),
    );
  });

  it('focuses a newly inserted title synchronously and never steals focus later', () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    function Harness() {
      const [values, setValues] = useState<LessonContentEditorValues>({
        learningTarget: '',
        notes: '',
        lessonFlow: [],
      });

      return (
        <LessonFlowEditor
          idPrefix="lesson-flow-focus-test"
          values={values}
          onChange={(update) => setValues((current) => update(current))}
        />
      );
    }

    try {
      render(<Harness />);

      fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

      const title = screen.getByLabelText('Step title');
      const minutes = screen.getByLabelText('Minutes');

      expect(title).toHaveFocus();
      expect(scrollIntoViewMock).toHaveBeenCalledOnce();

      minutes.focus();
      expect(minutes).toHaveFocus();
      expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();

      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });

  it('attaches a live Library source without copying Catalog content', () => {
    const resource: LibraryCatalogItem = {
      id: 'resource-1',
      catalogType: 'resource',
      title: 'Fraction cards',
      description: 'Reusable visual models.',
      tags: ['Math'],
      typedFields: { catalogType: 'resource', sourceLocation: 'Binder A' },
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    };
    let latestValues: LessonContentEditorValues = {
      learningTarget: '',
      notes: '',
      libraryLinks: [],
      lessonFlow: [],
    };

    render(
      <LessonFlowEditor
        idPrefix="lesson-library-test"
        values={latestValues}
        libraryItems={[resource]}
        onChange={(update) => {
          latestValues = update(latestValues);
        }}
      />,
    );

    fireEvent.click(screen.getByText('Add from Library'));
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));

    expect(latestValues.libraryLinks).toEqual([
      { libraryItemId: 'resource-1', catalogType: 'resource' },
    ]);
    expect(JSON.stringify(latestValues.libraryLinks)).not.toContain('Fraction cards');
  });
});
