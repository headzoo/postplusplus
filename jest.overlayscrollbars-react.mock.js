const React = require('react');

const OverlayScrollbarsComponent = ({
  children,
  className,
  id,
  style,
  events,
}) => {
  const ref = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!events) {
      return undefined;
    }

    const instance = {
      elements: () => ({ viewport: ref.current }),
    };
    events.initialized?.(instance);
    return () => {
      events.destroyed?.(instance);
    };
  }, [events]);

  return React.createElement('div', { className, id, style, ref }, children);
};

module.exports = {
  OverlayScrollbarsComponent,
};
