import styles from '../styles/Home.module.css'

export default function ResultsCard(props) {
    return (
        <div className={styles.grid}>
            <div className={styles.card}>
                <p><strong>{props.results.nbHits} results. 
                Showing you <strong>{props.results.nbHits.toString().length < props.results.limit.toString().length
                 ? props.results.nbHits : props.results.limit}. Search took </strong>({props.results.processingTimeMs} ms)</strong></p>
            </div>
        </div>
    )
}