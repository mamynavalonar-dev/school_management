import { createContext, useContext, useReducer, useEffect } from 'react';
import apiService from '../services/api.jsx';

const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_SUCCESS: 'SET_SUCCESS',
  CLEAR_NOTIFICATION: 'CLEAR_NOTIFICATION',
  SET_USER: 'SET_USER',
  LOGOUT: 'LOGOUT',
  SET_THEME: 'SET_THEME',
  SET_STATS: 'SET_STATS',
  SET_STUDENTS: 'SET_STUDENTS',
  SET_TEACHERS: 'SET_TEACHERS',
  SET_COURSES: 'SET_COURSES',
  SET_ROOMS: 'SET_ROOMS',
  SET_SCHEDULES: 'SET_SCHEDULES',
  SET_EVALUATIONS: 'SET_EVALUATIONS',
  SET_GRADES: 'SET_GRADES',
  SET_ABSENCES: 'SET_ABSENCES',
};

const initialState = {
  user: null,
  theme: 'light',
  loading: false,
  error: null,
  success: null,
  stats: {
    students: { total: 0, new: 0, active: 0 },
    teachers: { total: 0, active: 0 },
    courses: { total: 0, active: 0 },
    rooms: { total: 0, available: 0 },
    schedules: { today: 0, thisWeek: 0 },
    absences: { today: 0, thisMonth: 0 },
    evaluations: { upcoming: 0, thisMonth: 0 },
    grades: { pending: 0, completed: 0 }
  },
  data: {
    students: [],
    teachers: [],
    courses: [],
    rooms: [],
    schedules: [],
    evaluations: [],
    grades: [],
    absences: []
  }
};

const appReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return { ...state, loading: action.payload };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case ACTION_TYPES.SET_SUCCESS:
      return { ...state, success: action.payload, loading: false };
    case ACTION_TYPES.CLEAR_NOTIFICATION:
      return { ...state, error: null, success: null };
    case ACTION_TYPES.SET_USER:
      return { ...state, user: action.payload, loading: false };
    case ACTION_TYPES.LOGOUT:
      return { ...initialState, theme: state.theme };
    case ACTION_TYPES.SET_THEME:
      return { ...state, theme: action.payload };
    case ACTION_TYPES.SET_STATS:
      return { ...state, stats: { ...state.stats, ...action.payload } };
    case ACTION_TYPES.SET_STUDENTS:
      return { ...state, data: { ...state.data, students: action.payload } };
    case ACTION_TYPES.SET_TEACHERS:
      return { ...state, data: { ...state.data, teachers: action.payload } };
    case ACTION_TYPES.SET_COURSES:
      return { ...state, data: { ...state.data, courses: action.payload } };
    case ACTION_TYPES.SET_ROOMS:
      return { ...state, data: { ...state.data, rooms: action.payload } };
    case ACTION_TYPES.SET_SCHEDULES:
      return { ...state, data: { ...state.data, schedules: action.payload } };
    case ACTION_TYPES.SET_EVALUATIONS:
      return { ...state, data: { ...state.data, evaluations: action.payload } };
    case ACTION_TYPES.SET_GRADES:
      return { ...state, data: { ...state.data, grades: action.payload } };
    case ACTION_TYPES.SET_ABSENCES:
      return { ...state, data: { ...state.data, absences: action.payload } };
    default:
      return state;
  }
};

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  const actions = {
    setUser: (user) => {
      dispatch({ type: ACTION_TYPES.SET_USER, payload: user });
    },
    
    logout: () => {
      apiService.logout().finally(() => {
        dispatch({ type: ACTION_TYPES.LOGOUT });
      });
    },
    
    setLoading: (loading) => {
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: loading });
    },
    
    setError: (error) => {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: error });
    },
    
    setSuccess: (message) => {
      dispatch({ type: ACTION_TYPES.SET_SUCCESS, payload: message });
    },
    
    clearNotification: () => {
      dispatch({ type: ACTION_TYPES.CLEAR_NOTIFICATION });
    },
    
    setTheme: (theme) => {
      dispatch({ type: ACTION_TYPES.SET_THEME, payload: theme });
      localStorage.setItem('theme', theme);
      document.documentElement.className = theme;
    },
    
    loadDashboardStats: async () => {
      try {
        actions.setLoading(true);
        const stats = await apiService.getDashboardStats();
        dispatch({ type: ACTION_TYPES.SET_STATS, payload: stats });
      } catch (error) {
        actions.setError('Erreur lors du chargement des statistiques');
      } finally {
        actions.setLoading(false);
      }
    },
    
    loadStudents: async () => {
      try {
        actions.setLoading(true);
        const response = await apiService.getStudents();
        dispatch({ type: ACTION_TYPES.SET_STUDENTS, payload: response.data });
      } catch (error) {
        actions.setError('Erreur lors du chargement des étudiants');
      } finally {
        actions.setLoading(false);
      }
    },
    
    createStudent: async (studentData) => {
      try {
        actions.setLoading(true);
        const response = await apiService.createStudent(studentData);
        await actions.loadStudents();
        actions.setSuccess('Étudiant créé avec succès');
        return response;
      } catch (error) {
        actions.setError('Erreur lors de la création de l\'étudiant');
        throw error;
      } finally {
        actions.setLoading(false);
      }
    },
    
    updateStudent: async (id, studentData) => {
      try {
        actions.setLoading(true);
        const response = await apiService.updateStudent(id, studentData);
        await actions.loadStudents();
        actions.setSuccess('Étudiant modifié avec succès');
        return response;
      } catch (error) {
        actions.setError('Erreur lors de la modification de l\'étudiant');
        throw error;
      } finally {
        actions.setLoading(false);
      }
    },
    
    deleteStudent: async (id) => {
      try {
        actions.setLoading(true);
        await apiService.deleteStudent(id);
        await actions.loadStudents();
        actions.setSuccess('Étudiant supprimé avec succès');
      } catch (error) {
        actions.setError('Erreur lors de la suppression de l\'étudiant');
        throw error;
      } finally {
        actions.setLoading(false);
      }
    },
    
    loadTeachers: async () => {
      try {
        actions.setLoading(true);
        const response = await apiService.getTeachers();
        dispatch({ type: ACTION_TYPES.SET_TEACHERS, payload: response.data });
      } catch (error) {
        actions.setError('Erreur lors du chargement des enseignants');
      } finally {
        actions.setLoading(false);
      }
    },
    
    loadCourses: async () => {
      try {
        actions.setLoading(true);
        const response = await apiService.getCourses();
        dispatch({ type: ACTION_TYPES.SET_COURSES, payload: response.data });
      } catch (error) {
        actions.setError('Erreur lors du chargement des cours');
      } finally {
        actions.setLoading(false);
      }
    },
    
    loadRooms: async () => {},
    loadSchedules: async () => {},
    loadEvaluations: async () => {},
    loadGrades: async () => {},
    loadAbsences: async () => {},
  };
  
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    actions.setTheme(savedTheme);
  }, []);
  
  useEffect(() => {
    if (state.error || state.success) {
      const timer = setTimeout(() => {
        actions.clearNotification();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.error, state.success]);

  const value = {
    ...state,
    ...actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp doit être utilisé à l\'intérieur d\'un AppProvider');
  }
  return context;
};

export default AppContext;