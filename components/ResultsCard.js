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
                </div>
            ))}
        </div>
    )
}