import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface GlobalTaskStatus {
    isTaskRunning: boolean;
    taskId: string | null;
    toolType: string | null;
    status: 'IDLE' | 'VALIDATING' | 'SUBMITTING' | 'POLLING' | 'COMPLETED' | 'FAILED';
}

interface TaskStatusContextType {
    globalTaskStatus: GlobalTaskStatus;
    setGlobalTaskStatus: (status: Partial<GlobalTaskStatus>) => void;
    updateTaskStatus: (status: Partial<GlobalTaskStatus>) => void;
    resetTaskStatus: () => void;
}

const TaskStatusContext = createContext<TaskStatusContextType | undefined>(undefined);

interface TaskStatusProviderProps {
    children: ReactNode;
}

export const TaskStatusProvider: React.FC<TaskStatusProviderProps> = ({ children }) => {
    const [globalTaskStatus, setGlobalTaskStatusState] = useState<GlobalTaskStatus>({
        isTaskRunning: false,
        taskId: null,
        toolType: null,
        status: 'IDLE'
    });

    const setGlobalTaskStatus = useCallback((status: Partial<GlobalTaskStatus>) => {
        setGlobalTaskStatusState(prev => ({
            ...prev,
            ...status,
            isTaskRunning: status.status ? !['IDLE', 'COMPLETED', 'FAILED'].includes(status.status) : prev.isTaskRunning
        }));
    }, []);

    const updateTaskStatus = useCallback((status: Partial<GlobalTaskStatus>) => {
        setGlobalTaskStatus(status);
    }, [setGlobalTaskStatus]);

    const resetTaskStatus = useCallback(() => {
        setGlobalTaskStatusState({
            isTaskRunning: false,
            taskId: null,
            toolType: null,
            status: 'IDLE'
        });
    }, []);

    return (
        <TaskStatusContext.Provider value={{
            globalTaskStatus,
            setGlobalTaskStatus,
            updateTaskStatus,
            resetTaskStatus
        }}>
            {children}
        </TaskStatusContext.Provider>
    );
};

export const useGlobalTaskStatus = (): TaskStatusContextType => {
    const context = useContext(TaskStatusContext);
    if (context === undefined) {
        throw new Error('useGlobalTaskStatus must be used within a TaskStatusProvider');
    }
    return context;
};
