import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';
import { STORAGE_KEYS } from '../constants';

const AuthContext = createContext(null);

const initialState = {
  user: null,
  token: null,
  isLoading: true,   // true while restoring session from storage
  isAuthenticated: false,
};

const AUTH_ACTIONS = {
  RESTORE_SESSION: 'RESTORE_SESSION',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
  SET_LOADING: 'SET_LOADING',
};

function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.RESTORE_SESSION:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: !!action.payload.token,
        isLoading: false,
      };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: action.payload.user,
      };
    case AUTH_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Restore session on app start
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [token, userJson] = await AsyncStorage.multiGet([
          STORAGE_KEYS.AUTH_TOKEN,
          STORAGE_KEYS.USER_DATA,
        ]);

        const storedToken = token[1];
        const storedUser = userJson[1] ? JSON.parse(userJson[1]) : null;

        dispatch({
          type: AUTH_ACTIONS.RESTORE_SESSION,
          payload: { token: storedToken, user: storedUser },
        });
      } catch (error) {
        console.warn('Session restore failed:', error.message);
        dispatch({
          type: AUTH_ACTIONS.RESTORE_SESSION,
          payload: { token: null, user: null },
        });
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    const { token, user } = data.data;

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.AUTH_TOKEN, token],
      [STORAGE_KEYS.USER_DATA, JSON.stringify(user)],
    ]);

    dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { token, user } });
    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await authService.register(name, email, password);
    const { token, user } = data.data;

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.AUTH_TOKEN, token],
      [STORAGE_KEYS.USER_DATA, JSON.stringify(user)],
    ]);

    dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { token, user } });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_DATA]);
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  }, []);

  const updateUser = useCallback((user) => {
    AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, payload: { user } });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
