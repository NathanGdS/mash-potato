import React, { useEffect } from 'react';
import { useEnvironmentsStore } from '../store/environmentsStore';

const EnvironmentSelector: React.FC = () => {
  const environments = useEnvironmentsStore((s) => s.environments);
  const activeEnvironmentId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const fetchActiveEnvironment = useEnvironmentsStore((s) => s.fetchActiveEnvironment);
  const setActiveEnvironment = useEnvironmentsStore((s) => s.setActiveEnvironment);

  useEffect(() => {
    fetchActiveEnvironment();
  }, [fetchActiveEnvironment]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveEnvironment(e.target.value);
  };

  return (
    <select
      className="env-selector"
      value={activeEnvironmentId}
      onChange={handleChange}
      aria-label="Select active environment"
    >
      <option value="">None</option>
      {environments.map((env) => (
        <option key={env.id} value={env.id}>
          {env.name}
        </option>
      ))}
    </select>
  );
};

export default EnvironmentSelector;
