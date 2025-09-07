/**
 * TriggerX Agent Integration Tests
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { agentConfig } from '../src/index.js';

describe('TriggerX Agent Integration', () => {
  it('should have correct agent configuration', () => {
    expect(agentConfig.name).toContain('TriggerX');
    expect(agentConfig.skills).to.have.lengthOf(2);
    expect(agentConfig.skills.map(skill => skill.name)).to.include('jobManagement');
    expect(agentConfig.skills.map(skill => skill.name)).to.include('scheduleAssistant');
  });

  it('should have job management skill with correct tools', () => {
    const jobManagementSkill = agentConfig.skills.find(skill => skill.name === 'jobManagement');
    expect(jobManagementSkill).to.exist;
    expect(jobManagementSkill?.tools).to.have.lengthOf(6);
    
    const toolNames = jobManagementSkill?.tools.map(tool => tool.name);
    expect(toolNames).to.include('createTimeJob');
    expect(toolNames).to.include('createEventJob');
    expect(toolNames).to.include('createConditionJob');
    expect(toolNames).to.include('getJobs');
    expect(toolNames).to.include('deleteJob');
    expect(toolNames).to.include('getUserData');
  });

  it('should have schedule assistant skill', () => {
    const scheduleAssistantSkill = agentConfig.skills.find(skill => skill.name === 'scheduleAssistant');
    expect(scheduleAssistantSkill).to.exist;
    expect(scheduleAssistantSkill?.description).to.contain('guidance and assistance');
    expect(scheduleAssistantSkill?.tools).to.have.lengthOf(0); // Pure guidance skill
  });
});