'use client';

import { FC, useEffect, useMemo, useRef } from 'react';
import DrawChart from 'chart.js/auto';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FollowerRelationshipSnapshot } from '@gitroom/frontend/components/followers/use.followers';

const formatReciprocity = (value: number | null) => {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
};

const formatFormulaLabel = (
  formulaVersion: number,
  t: (key: string, fallback: string) => string
) => {
  if (formulaVersion === 2) {
    return t('followers_formula_priority_v2', 'Priority (v2)');
  }
  return t('followers_formula_reciprocity_v1', 'Reciprocity (v1)');
};

const formatGradeLabel = (
  grade: number | null,
  t: (key: string, fallback: string) => string
) => {
  if (grade == null) {
    return t(
      'followers_grade_not_enough_activity',
      'No grade (not enough tracked activity)'
    );
  }
  return String(grade);
};

export const FollowerRelationshipChart: FC<{
  history: FollowerRelationshipSnapshot[];
}> = ({ history }) => {
  const t = useT();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const chart = useRef<DrawChart | null>(null);

  const visibleHistory = useMemo(
    () => history.filter((snapshot) => snapshot.formulaVersion !== 1),
    [history]
  );
  const priorityLabel = t('followers_formula_priority_v2', 'Priority (v2)');

  useEffect(() => {
    if (!ref.current || !visibleHistory.length) {
      return;
    }

    const labels = visibleHistory.map((snapshot) =>
      newDayjs(snapshot.snapshotAt).format('MMM D, YYYY')
    );
    const grades = visibleHistory.map((snapshot) => snapshot.grade);

    chart.current = new DrawChart(ref.current, {
      type: 'line',
      options: {
        maintainAspectRatio: false,
        responsive: true,
        spanGaps: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          y: {
            min: 1,
            max: 5,
            ticks: {
              stepSize: 0.5,
            },
            title: {
              display: true,
              text: t('followers_chart_grade_axis', 'Grade'),
            },
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 0,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const snapshot = visibleHistory[context.dataIndex];
                if (!snapshot) {
                  return '';
                }
                const formulaLabel = formatFormulaLabel(
                  snapshot.formulaVersion,
                  t
                );
                const gradeLabel =
                  snapshot.grade == null
                    ? t(
                        'followers_grade_not_enough_activity',
                        'No grade (not enough tracked activity)'
                      )
                    : t('followers_chart_grade_value', 'Grade: {{grade}}', {
                        grade: snapshot.grade,
                      });
                return [
                  formulaLabel,
                  gradeLabel,
                  `E: ${snapshot.effortScore}`,
                  `R: ${snapshot.reciprocationScore}`,
                  `${t(
                    'followers_grade_reciprocity',
                    'Reciprocity: {{value}}',
                    {
                      value: formatReciprocity(snapshot.reciprocity),
                    }
                  )}`,
                ];
              },
            },
          },
        },
      },
      data: {
        labels,
        datasets: [
          {
            label: priorityLabel,
            data: grades,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            pointBackgroundColor: '#2563eb',
            pointRadius: 4,
            tension: 0.2,
            fill: false,
            spanGaps: false,
          },
        ],
      },
    });

    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [priorityLabel, t, visibleHistory]);

  if (!visibleHistory.length) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-[12px]">
      <div className="h-[220px] w-full" aria-hidden="true">
        <canvas ref={ref} className="h-full w-full" />
      </div>
      <div className="w-full max-w-full overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px] text-textItemBlur"
          aria-label={t(
            'followers_relationship_history_table',
            'Relationship history'
          )}
        >
          <thead>
            <tr className="border-b border-newTableBorder text-left text-[12px] uppercase tracking-wide text-newTextColor">
              <th scope="col" className="py-[8px] pe-[12px] font-[600]">
                {t('followers_history_date', 'Date')}
              </th>
              <th scope="col" className="py-[8px] pe-[12px] font-[600]">
                {t('followers_history_formula', 'Formula')}
              </th>
              <th scope="col" className="py-[8px] pe-[12px] font-[600]">
                {t('followers_history_grade', 'Grade')}
              </th>
              <th scope="col" className="py-[8px] pe-[12px] font-[600]">
                E
              </th>
              <th scope="col" className="py-[8px] pe-[12px] font-[600]">
                R
              </th>
              <th scope="col" className="py-[8px] font-[600]">
                {t('followers_history_reciprocity', 'Reciprocity')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleHistory.map((snapshot) => (
              <tr
                key={snapshot.snapshotAt}
                className="border-b border-newTableBorder"
              >
                <td className="break-words py-[8px] pe-[12px] text-newTextColor">
                  {newDayjs(snapshot.snapshotAt).format('MMM D, YYYY')}
                </td>
                <td className="break-words py-[8px] pe-[12px]">
                  {formatFormulaLabel(snapshot.formulaVersion, t)}
                </td>
                <td className="break-words py-[8px] pe-[12px]">
                  {formatGradeLabel(snapshot.grade, t)}
                </td>
                <td className="py-[8px] pe-[12px]">{snapshot.effortScore}</td>
                <td className="py-[8px] pe-[12px]">
                  {snapshot.reciprocationScore}
                </td>
                <td className="py-[8px]">
                  {formatReciprocity(snapshot.reciprocity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
