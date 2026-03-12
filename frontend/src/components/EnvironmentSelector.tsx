import React, { useEffect } from 'react';
import { useEnvironmentsStore } from '../store/environmentsStore';

const EnvironmentSelector: React.FC = () => {
  const environments = useEnvironmentsStore((s) => s.environments);
  const activeEnvironmentId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const fetchActiveEnvironment = useEnvironmentsStore((s) => s.fetchActiveEnvironment);
  const setActiveEnvironment = useEnvironmentsStore((s) => s.setActiveEnvironment);
  const fetchVariables = useEnvironmentsStore((s) => s.fetchVariables);
  const variables = useEnvironmentsStore((s) => s.variables);

  useEffect(() => {
    fetchActiveEnvironment();
  }, [fetchActiveEnvironment]);

  // Pre-fetch variables whenever the active environment changes so the
  // {{ autocomplete popover is ready without delay.
  useEffect(() => {
    if (activeEnvironmentId && !variables[activeEnvironmentId]) {
      fetchVariables(activeEnvironmentId);
    }
  }, [activeEnvironmentId, variables, fetchVariables]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveEnvironment(e.target.value);
  };

  const hasActive = Boolean(activeEnvironmentId);

  return (
    <select
      className={`env-selector${hasActive ? ' env-selector--active' : ''}`}
      value={activeEnvironmentId}
      onChange={handleChange}
      aria-label="Select active environment"
    >
      <option value="">No Environment</option>
      {environments.map((env) => (
        <option key={env.id} value={env.id}>
          {env.name}
        </option>
      ))}
    </select>
  );
};

export default EnvironmentSelector;
