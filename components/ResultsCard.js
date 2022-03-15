import styles from '../styles/Home.module.css'

export default function ResultsCard(props) {
    return (
        <div className={styles.grid}>
            {props.results.hits.map((hit, index) => (
                <div key={index} className={styles.card}>
                    {<h3>{hit.Identifier}</h3>}
                    <h3>{hit.Section}</h3>
                    <p>{hit.Guideline}</p>
                    <p>{hit.Topic}</p>
                    <br />
                    <p>{hit.Description}</p>
                    <br />
                    <p>Revision: {hit.Revision}</p>
                    <p>Update {hit.Updated}</p>
                    <br />
                    <p>OFFICIAL: {hit.OFFICIAL}</p>
                    <p>PROTECTED: {hit.PROTECTED}</p>
                    <p>SECRET: {hit.SECRET}</p>
                    <p>TOP SECRET: {hit.TOPSECRET}</p>
                    <p>Maturity Level 2: {hit.ML2}</p>
                    <p>Maturity Level 3: {hit.ML3}</p>
                    <p></p>
                </div>
            ))}
        </div>
    )
}