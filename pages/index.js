import React, { useState } from 'react';
import styles from '../styles/Home.module.css'
import { useForm } from "react-hook-form";
import ResultsCard from '../components/ResultsCard'
import SearchInfo from '../components/SearchInfo'

export default function Home() {

  const { register, handleSubmit, errors } = useForm();
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const searchQuery = async (data) => {

    let url = '' 
    if(data.PROTECTED) {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?searchFilters=(PROTECTED = Yes AND OFFICIAL = No)&queryLimit=${data.numberOfResults}`
    }
    else if(data.NOTOPORSECRET) {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?searchFilters=(TOPSECRET= No AND SECRET = No)&queryLimit=${data.numberOfResults}&searchQuery=${data.searchTerm}`
    }
    else {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?queryLimit=${data.numberOfResults}&searchQuery=${data.searchTerm}`
    }

    let res = await fetch(url,
        {
          headers: {
              "Access-Control-Allow-Origin": `${process.env.NEXT_PUBLIC_CORS_DOMAIN ?? 'http://localhost:3000'}`,
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Allow-Methods": "GET",
          },
        }
      )
    if (res.ok) {
      let json = await res.json()
      setResults(json)
      return 
    } else {
      setError("An error occurred. Please try again later.")
      return
    }
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>
          ISM Search
        </h1>

        <p className={styles.description}>
          Get started by entering a search term below...
        </p>

        <div className={styles.card}>
          <strong><a href='/disclaimer'>Disclaimer</a></strong>
        </div>

        <div className={styles.card}>
          <p>Last updated: 22/01/2021</p>
          <br />
          <h3>Coming soon...</h3>
          <li>Export to csv function</li>
          <li>Notification of new ISM version</li>
          <li>Searchable previous versions of the ISM</li>
        </div>

        <form onSubmit={handleSubmit(searchQuery)}>
          
          <label>
              Enter search term here.. ie. 0041 or CISO
              <input placeholder={"Enter search term..."} style={{ borderRadius: '25px', width: '100%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} name="searchTerm" ref={register({ required: false })} />
          </label>
          <label>
              Limit results
              <br />
              <input defaultValue={10} style={{ borderRadius: '25px', width: '20%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} type="number" name="numberOfResults" ref={register({ required: false })} min="1" max="800"></input>
          </label>
          <br />
          <label>
              Show me only PROTECTED controls
              <input type={'checkbox'} style={{height:'15px', width:'15px'}} name="PROTECTED" ref={register({ required: false })} />
          </label>
          <br />
          <label>
              Exclude SECRET and TOP SECRET controls from result
              <input type={'checkbox'} style={{height:'15px', width:'15px'}} name="NOTOPORSECRET" ref={register({ required: false })} />
          </label>
          
          <br />
          <br />
          <button style={{ fontWeight:'bold', borderRadius: '25px', backgroundColor: '#4ecca3', border: 'none', color: '#eeeeee', padding: '16px 32px', width: '100%' }} type="submit">Submit</button>
        </form>

        {results?.hits?.length < 1 &&
          <div className={styles.card}>
            <p>No results...</p>
            {error && <p>{error}</p>}
          </div>
        }

        {results?.hits?.length > 0 &&
          <SearchInfo results={results} />
        }

        {results?.hits?.length > 0 &&
          <ResultsCard results={results} />
        }

      </main>

      <footer className={styles.footer}>
        &copy; - Justin Middler 2021
      </footer>
    </div>
  )
}
