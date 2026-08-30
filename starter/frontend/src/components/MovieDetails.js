import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

const API_URL =
  process.env.REACT_APP_MOVIE_API_URL ||
  'http://ad54d235eff574475a1b293c49b0987d-1253446804.us-east-1.elb.amazonaws.com';

function MovieDetail({ movie }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!movie || !movie.id) return;
    axios
      .get(`${API_URL}/movies/${movie.id}`)
      .then((response) => {
        setDetails(response.data);
      })
      .catch((err) => {
        console.error('Error fetching movie details:', err);
      });
  }, [movie]);

  return (
    <div>
      <h2>{details?.movie.title}</h2>
      <p>{details?.movie.description}</p>
    </div>
  );
}

MovieDetail.propTypes = {
  movie: PropTypes.object,
};

export default MovieDetail;
