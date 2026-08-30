import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

const API_URL =
  process.env.REACT_APP_MOVIE_API_URL ||
  'http://ad54d235eff574475a1b293c49b0987d-1253446804.us-east-1.elb.amazonaws.com';

function MovieList({ onMovieClick }) {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    axios
      .get(`${API_URL}/movies`)
      .then((response) => {
        setMovies(response.data.movies);
      })
      .catch((err) => {
        console.error('Error fetching movies:', err);
      });
  }, []);

  return (
    <ul>
      {movies.map((movie) => (
        <li className="movieItem" key={movie.id} onClick={() => onMovieClick(movie)}>
          {movie.title}
        </li>
      ))}
    </ul>
  );
}

MovieList.propTypes = {
  onMovieClick: PropTypes.func.isRequired,
};

export default MovieList;
