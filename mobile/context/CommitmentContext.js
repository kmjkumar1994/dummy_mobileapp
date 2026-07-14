import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { commitmentService } from '../services/commitmentService';

const CommitmentContext = createContext(null);

const initialState = {
  commitments: [],
  availability: null,
  isLoading: false,
  error: null,
};

const COMMITMENT_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_COMMITMENTS: 'SET_COMMITMENTS',
  ADD_COMMITMENT: 'ADD_COMMITMENT',
  UPDATE_COMMITMENT: 'UPDATE_COMMITMENT',
  DELETE_COMMITMENT: 'DELETE_COMMITMENT',
  SET_AVAILABILITY: 'SET_AVAILABILITY',
};

function commitmentReducer(state, action) {
  switch (action.type) {
    case COMMITMENT_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload, error: null };

    case COMMITMENT_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, isLoading: false };

    case COMMITMENT_ACTIONS.SET_COMMITMENTS:
      return { ...state, commitments: action.payload, isLoading: false };

    case COMMITMENT_ACTIONS.ADD_COMMITMENT:
      return {
        ...state,
        commitments: [action.payload, ...state.commitments],
        isLoading: false,
      };

    case COMMITMENT_ACTIONS.UPDATE_COMMITMENT:
      return {
        ...state,
        commitments: state.commitments.map((c) =>
          c._id === action.payload._id ? action.payload : c
        ),
        isLoading: false,
      };

    case COMMITMENT_ACTIONS.DELETE_COMMITMENT:
      return {
        ...state,
        commitments: state.commitments.filter((c) => c._id !== action.payload),
        isLoading: false,
      };

    case COMMITMENT_ACTIONS.SET_AVAILABILITY:
      return { ...state, availability: action.payload, isLoading: false };

    default:
      return state;
  }
}

export function CommitmentProvider({ children }) {
  const [state, dispatch] = useReducer(commitmentReducer, initialState);

  const fetchCommitments = useCallback(async (filters = {}) => {
    dispatch({ type: COMMITMENT_ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await commitmentService.getAll(filters);
      dispatch({ type: COMMITMENT_ACTIONS.SET_COMMITMENTS, payload: data.data.commitments });
    } catch (error) {
      dispatch({ type: COMMITMENT_ACTIONS.SET_ERROR, payload: error.message });
    }
  }, []);

  const createCommitment = useCallback(async (formData) => {
    dispatch({ type: COMMITMENT_ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await commitmentService.create(formData);
      dispatch({ type: COMMITMENT_ACTIONS.ADD_COMMITMENT, payload: data.data.commitment });
      return data;
    } catch (error) {
      dispatch({ type: COMMITMENT_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  }, []);

  const updateCommitment = useCallback(async (id, formData) => {
    dispatch({ type: COMMITMENT_ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await commitmentService.update(id, formData);
      dispatch({ type: COMMITMENT_ACTIONS.UPDATE_COMMITMENT, payload: data.data.commitment });
      return data;
    } catch (error) {
      dispatch({ type: COMMITMENT_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  }, []);

  const deleteCommitment = useCallback(async (id) => {
    dispatch({ type: COMMITMENT_ACTIONS.SET_LOADING, payload: true });
    try {
      await commitmentService.delete(id);
      dispatch({ type: COMMITMENT_ACTIONS.DELETE_COMMITMENT, payload: id });
    } catch (error) {
      dispatch({ type: COMMITMENT_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  }, []);

  const fetchAvailability = useCallback(async (date) => {
    dispatch({ type: COMMITMENT_ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await commitmentService.getAvailability(date);
      dispatch({ type: COMMITMENT_ACTIONS.SET_AVAILABILITY, payload: data.data });
    } catch (error) {
      dispatch({ type: COMMITMENT_ACTIONS.SET_ERROR, payload: error.message });
    }
  }, []);

  return (
    <CommitmentContext.Provider
      value={{
        ...state,
        fetchCommitments,
        createCommitment,
        updateCommitment,
        deleteCommitment,
        fetchAvailability,
      }}
    >
      {children}
    </CommitmentContext.Provider>
  );
}

export function useCommitments() {
  const context = useContext(CommitmentContext);
  if (!context) {
    throw new Error('useCommitments must be used within a CommitmentProvider');
  }
  return context;
}