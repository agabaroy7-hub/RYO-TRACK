import { contextBridge, ipcRenderer } from 'electron';
import type { DashboardResponse, WorkLogInput, WorkTrackBridge } from '../src/shared/types';

const api: WorkTrackBridge = {
  getDashboard: () => ipcRenderer.invoke('worktrack:get-dashboard') as Promise<DashboardResponse>,
  logWork: (input: WorkLogInput) => ipcRenderer.invoke('worktrack:log-work', input) as Promise<DashboardResponse>,
  updateGoals: (input) => ipcRenderer.invoke('worktrack:update-goals', input) as Promise<DashboardResponse>,
  createGoalTemplate: (input) => ipcRenderer.invoke('worktrack:create-goal-template', input) as Promise<DashboardResponse>,
  applyGoalTemplate: (templateId) => ipcRenderer.invoke('worktrack:apply-goal-template', templateId) as Promise<DashboardResponse>,
  deleteGoalTemplate: (templateId) => ipcRenderer.invoke('worktrack:delete-goal-template', templateId) as Promise<DashboardResponse>,
  resetDay: () => ipcRenderer.invoke('worktrack:reset-day') as Promise<DashboardResponse>,
  resetEverything: () => ipcRenderer.invoke('worktrack:reset-everything') as Promise<DashboardResponse>
};

contextBridge.exposeInMainWorld('worktrack', api);